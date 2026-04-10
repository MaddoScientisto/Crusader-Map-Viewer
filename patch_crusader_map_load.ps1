<#
.SYNOPSIS
Patch the fresh-game startup selector, editor-object visibility, the No Regret loosecannon debugger hook, the Remorse datalink movie-browser route, and the DOSBox soft-startup config editor in a local Crusader install.

.DESCRIPTION
This script patches up to four retail behavior families:

- the hardcoded new-game startup call inside Game_Start
- the `SI_EDITOR` gates that suppress editor objects in the world-item renderer
- in No Regret only, the hidden `loosecannon` cheat lane retargets that bootstrap and open the hidden usecode debugger
- in No Remorse only, the final `DATALINK::use` callee token in `USECODE\EUSECODE.FLX`
- the DOSBox startup config line in `dosboxREGRET_single.conf` or `dosboxCRUSADER_single.conf`

It auto-detects whether the local executable is Crusader: No Remorse (`CRUSADER.EXE`) or
Crusader: No Regret (`REGRET.EXE`) based on the executable found in the same folder as this
script.

In both supported games, the retail startup selector payload is:

    6A 01 66 68 01 00 1E 00

Decoded as the startup selector payload used by this patcher:

    6A 01          PUSH 1           ; dostasis = 1
    66 68 01 00    PUSH map 0x0001
    66 68 1E 00    PUSH egg 0x001E

For the startup selector patch, this script preserves the fixed instruction prefix
6A 01 66 68 and rewrites only the trailing 16-bit little-endian map and egg values.

That means:
- bytes 4-5 are the startup map number
- bytes 6-7 are the startup egg id
- only the normal fresh-game startup path is changed
- the separate debug -warp mission table is untouched

For the editor-object visibility patch, this script resolves both recovered `SI_EDITOR`
gates and flips their short conditional branches:

    1180:0951..095c  ; upstream world-item builder skip, before draw-node allocation
    1198:0332..033d  ; downstream sprite paint skip, inside Item_PaintSprite

    74 03    ; retail: jump over the early-out only when SI_EDITOR is clear
    EB 03    ; patched: always jump over the early-out, forcing editor shapes visible

That means:
- each site remains a 1-byte behavior change inside the existing control flow
- the surrounding `JMP` to the skip/epilogue path is left intact
- restore writes the retail `74 03` bytes back at both sites

The script resolves the exact patch site at runtime by scanning the detected executable for the
fresh-game startup selector signature.

For the No Regret-only loosecannon debugger patch, this script patches the installed
`REGRET.EXE` fixup records directly.

It rewrites the documented successful retarget set from the live Regret debugger experiment:

    0x7BB25  bootstrap call  12d8:04d0 -> 1398:0000
    0x7BB05  normal message   1350:0046 -> 1398:020d
    0x7BB15  Christmas lane   1350:0046 -> 1398:020d

That means:
- the normal `loosecannon` lane gains a debugger bootstrap before the active-cheat dialog path
- the active-cheat dialog call is replaced with `usecode_debugger_open_modal`
- the Christmas-only alternate dialog path is patched too so behavior stays consistent across dates
- restore writes the retail fixup records back verbatim

For the Remorse-only datalink movie-browser patch, the script patches the installed
`USECODE\EUSECODE.FLX` file rather than the executable.

It resolves one unique `DATALINK::use` tail signature and rewrites only the 2-byte class token in
the final `slot_20` spawn from `TEXTFILE` (`0x0A17`) to `FLICTEST` (`0x0A20`).

That means:
- only 2 bytes are changed in `USECODE\EUSECODE.FLX`
- the executable and its relocation-sensitive far-call sites are untouched
- restore writes the original `TEXTFILE` class token back verbatim

.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File .\patch_crusader_map_load.ps1 -Choice status

.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File .\patch_crusader_map_load.ps1 -Choice map-redirect -FirstMissionMap 248

.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File .\patch_crusader_map_load.ps1 -Choice map-redirect -FirstMissionMap 248 -FirstMissionEgg 0x1E

.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File .\patch_crusader_map_load.ps1 -Choice map-default

.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File .\patch_crusader_map_load.ps1 -Choice editor-visible

.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File .\patch_crusader_map_load.ps1 -Choice editor-default

.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File .\patch_crusader_map_load.ps1 -Choice flictest-enable

.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File .\patch_crusader_map_load.ps1 -Choice flictest-default

.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File .\patch_crusader_map_load.ps1 -Choice debugger-enable

.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File .\patch_crusader_map_load.ps1 -Choice debugger-default

.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File .\patch_crusader_map_load.ps1 -Choice soft-startup
#>

param(
    [ValidateSet('1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'status', 'map-redirect', 'map-default', 'editor-visible', 'editor-default', 'debugger-enable', 'debugger-default', 'flictest-enable', 'flictest-default', 'soft-startup', 'documentation', 'exit')]
    [string]$Choice,

    [ValidateRange(0, 65535)]
    [int]$FirstMissionMap,

    [ValidateRange(0, 65535)]
    [Nullable[int]]$FirstMissionEgg
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:CliParameterState = @{
    HasFirstMissionMap = $PSBoundParameters.ContainsKey('FirstMissionMap')
    HasFirstMissionEgg = $PSBoundParameters.ContainsKey('FirstMissionEgg')
}

$gameConfigs = @(
    @{
        GameTitle = 'Crusader: No Remorse'
        Mode = 'remorse'
        ExeName = 'CRUSADER.EXE'
        StartupConfigName = 'dosboxCRUSADER_single.conf'
        SiteDefinitions = @(
            @{
                Label = 'Fresh-game startup map/egg selector'
                StatusLabel = 'Fresh-game startup'
                GhidraSelectorPush = '1020:0243'
                GhidraSelectorCall = '1020:0249'
                Signature = @{
                    Bytes = [byte[]](0x6A, 0x01, 0x66, 0x68, 0x01, 0x00, 0x1E, 0x00, 0x9A, 0x00, 0x00, 0x00, 0x00, 0x83, 0xC4, 0x06)
                    Mask = [bool[]]($true, $true, $true, $true, $false, $false, $false, $false, $true, $false, $false, $false, $false, $true, $true, $true)
                }
            }
        )
        EditorVisibilityDefinitions = @(
            @{
                Label = 'Editor world-item visibility gate'
                StatusLabel = 'Editor world-item gate'
                Signature = @{
                    Bytes = [byte[]](0x26, 0x8A, 0x47, 0x06, 0x25, 0x01, 0x00, 0x0B, 0xC0, 0x74, 0x03, 0xE9, 0x8D, 0x02)
                    Mask = [bool[]]($true, $true, $true, $true, $true, $true, $true, $true, $true, $false, $true, $true, $true, $true)
                }
                Original = [byte[]](0x26, 0x8A, 0x47, 0x06, 0x25, 0x01, 0x00, 0x0B, 0xC0, 0x74, 0x03, 0xE9, 0x8D, 0x02)
                Enabled = [byte[]](0x26, 0x8A, 0x47, 0x06, 0x25, 0x01, 0x00, 0x0B, 0xC0, 0xEB, 0x03, 0xE9, 0x8D, 0x02)
            },
            @{
                Label = 'Editor sprite-paint visibility gate'
                StatusLabel = 'Editor sprite-paint gate'
                Signature = @{
                    Bytes = [byte[]](0x26, 0x8A, 0x47, 0x06, 0x25, 0x01, 0x00, 0x0B, 0xC0, 0x74, 0x03, 0xE9, 0x19, 0x06)
                    Mask = [bool[]]($true, $true, $true, $true, $true, $true, $true, $true, $true, $false, $true, $true, $true, $true)
                }
                Original = [byte[]](0x26, 0x8A, 0x47, 0x06, 0x25, 0x01, 0x00, 0x0B, 0xC0, 0x74, 0x03, 0xE9, 0x19, 0x06)
                Enabled = [byte[]](0x26, 0x8A, 0x47, 0x06, 0x25, 0x01, 0x00, 0x0B, 0xC0, 0xEB, 0x03, 0xE9, 0x19, 0x06)
            }
        )
        DebuggerDefinitions = @()
        FlictestDefinitions = @(
            @{
                Label = 'DATALINK final spawn callee'
                StatusLabel = 'Remorse datalink browser target'
                PathRelativeToTargetDir = 'USECODE\EUSECODE.FLX'
                Signature = @{
                    Bytes = [byte[]](0x52, 0x2C, 0x00, 0x5B, 0x6E, 0x04, 0x59, 0x41, 0xFE, 0x40, 0x06, 0x57, 0x02, 0x02, 0x17, 0x0A, 0x20, 0x00, 0x65, 0x00, 0x6E, 0xFE, 0x5E, 0x54, 0x01, 0x01, 0x12, 0x53, 0x5C)
                    Mask = [bool[]]($true, $true, $true, $true, $true, $true, $true, $true, $true, $true, $true, $true, $true, $true, $false, $false, $true, $true, $true, $true, $true, $true, $true, $true, $true, $true, $true, $true, $true)
                }
                PatchOffset = 14
                Original = [byte[]](0x17, 0x0A)
                Enabled = [byte[]](0x20, 0x0A)
            }
        )
    },
    @{
        GameTitle = 'Crusader: No Regret'
        Mode = 'regret'
        ExeName = 'REGRET.EXE'
        StartupConfigName = 'dosboxREGRET_single.conf'
        SiteDefinitions = @(
            @{
                Label = 'Menu-start startup map/egg selector'
                StatusLabel = 'Menu-start startup'
                GhidraSelectorPush = '1008:1448'
                GhidraSelectorCall = '1008:144e'
                Signature = @{
                    Bytes = [byte[]](0x6A, 0x01, 0x66, 0x68, 0x01, 0x00, 0x1E, 0x00, 0x9A, 0x00, 0x00, 0x00, 0x00, 0x83, 0xC4, 0x06)
                    Mask = [bool[]]($true, $true, $true, $true, $false, $false, $false, $false, $true, $false, $false, $false, $false, $true, $true, $true)
                }
            },
            @{
                Label = 'Mission-start map/egg selector'
                StatusLabel = 'Mission-start selector'
                GhidraSelectorPush = '1030:05c5'
                GhidraSelectorCall = '1030:05cc'
                Signature = @{
                    Bytes = [byte[]](0x6A, 0x01, 0x66, 0x68, 0x01, 0x00, 0x1E, 0x00, 0x0E, 0xE8, 0x00, 0x00, 0x83, 0xC4, 0x06)
                    Mask = [bool[]]($true, $true, $true, $true, $false, $false, $false, $false, $true, $true, $false, $false, $true, $true, $true)
                }
            }
        )
        EditorVisibilityDefinitions = @(
            @{
                Label = 'Editor world-item visibility gate'
                StatusLabel = 'Editor world-item gate'
                Signature = @{
                    Bytes = [byte[]](0x26, 0x8A, 0x47, 0x06, 0x25, 0x01, 0x00, 0x0B, 0xC0, 0x74, 0x03, 0xE9, 0xBB, 0x02)
                    Mask = [bool[]]($true, $true, $true, $true, $true, $true, $true, $true, $true, $false, $true, $true, $true, $true)
                }
                Original = [byte[]](0x26, 0x8A, 0x47, 0x06, 0x25, 0x01, 0x00, 0x0B, 0xC0, 0x74, 0x03, 0xE9, 0xBB, 0x02)
                Enabled = [byte[]](0x26, 0x8A, 0x47, 0x06, 0x25, 0x01, 0x00, 0x0B, 0xC0, 0xEB, 0x03, 0xE9, 0xBB, 0x02)
            },
            @{
                Label = 'Editor sprite-paint visibility gate'
                StatusLabel = 'Editor sprite-paint gate'
                Signature = @{
                    Bytes = [byte[]](0x26, 0x8A, 0x47, 0x06, 0x25, 0x01, 0x00, 0x0B, 0xC0, 0x74, 0x03, 0xE9, 0x19, 0x06)
                    Mask = [bool[]]($true, $true, $true, $true, $true, $true, $true, $true, $true, $false, $true, $true, $true, $true)
                }
                Original = [byte[]](0x26, 0x8A, 0x47, 0x06, 0x25, 0x01, 0x00, 0x0B, 0xC0, 0x74, 0x03, 0xE9, 0x19, 0x06)
                Enabled = [byte[]](0x26, 0x8A, 0x47, 0x06, 0x25, 0x01, 0x00, 0x0B, 0xC0, 0xEB, 0x03, 0xE9, 0x19, 0x06)
            }
        )
        DebuggerDefinitions = @(
            @{
                Label = 'Loosecannon debugger bootstrap retarget'
                StatusLabel = 'Loosecannon bootstrap retarget'
                Offset = 0x7BB25
                Original = [byte[]](0x03, 0x00, 0x79, 0x36, 0x5C, 0x00, 0xD0, 0x04)
                Enabled = [byte[]](0x03, 0x00, 0x79, 0x36, 0x74, 0x00, 0x00, 0x00)
            },
            @{
                Label = 'Loosecannon active-message debugger retarget'
                StatusLabel = 'Loosecannon active-message retarget'
                Offset = 0x7BB05
                Original = [byte[]](0x03, 0x00, 0x03, 0x37, 0x6B, 0x00, 0x46, 0x00)
                Enabled = [byte[]](0x03, 0x00, 0x03, 0x37, 0x74, 0x00, 0x0D, 0x02)
            },
            @{
                Label = 'Loosecannon Christmas-message debugger retarget'
                StatusLabel = 'Loosecannon Christmas retarget'
                Offset = 0x7BB15
                Original = [byte[]](0x03, 0x00, 0xC1, 0x36, 0x6B, 0x00, 0x46, 0x00)
                Enabled = [byte[]](0x03, 0x00, 0xC1, 0x36, 0x74, 0x00, 0x0D, 0x02)
            }
        )
        FlictestDefinitions = @()
    }
)

function Format-OffsetList {
    param([int[]]$Offsets)

    if (-not $Offsets -or $Offsets.Count -eq 0) {
        return '<none>'
    }

    return (($Offsets | ForEach-Object { '0x{0:X}' -f $_ }) -join ', ')
}

function Find-BytePatternOffsets {
    param(
        [byte[]]$Bytes,
        [byte[]]$Pattern,
        [bool[]]$Mask
    )

    if ($Pattern.Length -ne $Mask.Length) {
        throw 'Pattern and mask lengths must match.'
    }

    $foundOffsets = New-Object System.Collections.Generic.List[int]
    $lastOffset = $Bytes.Length - $Pattern.Length

    for ($offset = 0; $offset -le $lastOffset; $offset++) {
        $isMatchFound = $true
        for ($index = 0; $index -lt $Pattern.Length; $index++) {
            if ($Mask[$index] -and $Bytes[$offset + $index] -ne $Pattern[$index]) {
                $isMatchFound = $false
                break
            }
        }

        if ($isMatchFound) {
            [void]$foundOffsets.Add($offset)
        }
    }

    return [int[]]$foundOffsets.ToArray()
}

function Find-ResolvedSingleOffset {
    param(
        [byte[]]$Bytes,
        [hashtable]$Signature,
        [string]$GameTitle,
        [string]$Label
    )

    $offsets = @(Find-BytePatternOffsets -Bytes $Bytes -Pattern $Signature.Bytes -Mask $Signature.Mask)

    if ($offsets.Count -eq 0) {
        throw (
            "{0} did not contain the expected signature for '{1}'. Refusing to patch an unknown executable layout." -f
            $GameTitle,
            $Label
        )
    }

    if ($offsets.Count -gt 1) {
        throw (
            "{0} matched the signature for '{1}' at multiple offsets ({2}). Refusing to patch an ambiguous executable layout." -f
            $GameTitle,
            $Label,
            (Format-OffsetList -Offsets $offsets)
        )
    }

    return $offsets[0]
}

function Get-ResolvedTarget {
    $candidateTargets = @(
        foreach ($candidateGame in $gameConfigs) {
            $candidatePath = Join-Path $PSScriptRoot $candidateGame.ExeName
            if (Test-Path -LiteralPath $candidatePath) {
                @{
                    GameTitle = $candidateGame.GameTitle
                    Mode = $candidateGame.Mode
                    ExeName = $candidateGame.ExeName
                    ExePath = $candidatePath
                    StartupConfigName = $candidateGame.StartupConfigName
                    SiteDefinitions = $candidateGame.SiteDefinitions
                    EditorVisibilityDefinitions = $candidateGame.EditorVisibilityDefinitions
                    FlictestDefinitions = $candidateGame.FlictestDefinitions
                    DebuggerDefinitions = $candidateGame.DebuggerDefinitions
                }
            }
        }
    )

    if ($candidateTargets.Count -eq 0) {
        throw (
            "No supported Crusader executable was found next to this script. Expected one of: {0}" -f
            (($gameConfigs | ForEach-Object { $_.ExeName }) -join ', ')
        )
    }

    if ($candidateTargets.Count -gt 1) {
        throw (
            "Multiple supported executables were found next to this script: {0}. Leave only one supported executable in the folder so the mode is unambiguous." -f
            (($candidateTargets | ForEach-Object { $_.ExeName }) -join ', ')
        )
    }

    $target = $candidateTargets[0]
    $fileBytes = [System.IO.File]::ReadAllBytes($target.ExePath)
    $resolvedSites = @()

    foreach ($siteDefinition in $target.SiteDefinitions) {
        $resolvedSites += @{
            Label = $siteDefinition.Label
            StatusLabel = $siteDefinition.StatusLabel
            Offset = Find-ResolvedSingleOffset -Bytes $fileBytes -Signature $siteDefinition.Signature -GameTitle $target.GameTitle -Label $siteDefinition.Label
            Prefix = [byte[]](0x6A, 0x01, 0x66, 0x68)
            Original = [byte[]](0x6A, 0x01, 0x66, 0x68, 0x01, 0x00, 0x1E, 0x00)
            DefaultMap = 1
            DefaultEgg = 0x1E
            GhidraSelectorPush = $siteDefinition.GhidraSelectorPush
            GhidraSelectorCall = $siteDefinition.GhidraSelectorCall
        }
    }

    $resolvedEditorVisibilitySites = @(
        foreach ($definition in $target.EditorVisibilityDefinitions) {
            @{
                Label = $definition.Label
                StatusLabel = $definition.StatusLabel
                Offset = Find-ResolvedSingleOffset -Bytes $fileBytes -Signature $definition.Signature -GameTitle $target.GameTitle -Label $definition.Label
                Original = $definition.Original
                Enabled = $definition.Enabled
            }
        }
    )

    $resolvedDebuggerSites = New-Object System.Collections.Generic.List[hashtable]
    foreach ($definition in $target.DebuggerDefinitions) {
        [void]$resolvedDebuggerSites.Add(@{
            Label = $definition.Label
            StatusLabel = $definition.StatusLabel
            Offset = [int]$definition.Offset
            FilePath = $target.ExePath
            Original = $definition.Original
            Enabled = $definition.Enabled
        })
    }

    $targetRoot = [System.IO.Path]::GetDirectoryName($target.ExePath)
    $resolvedFlictestSites = New-Object System.Collections.Generic.List[hashtable]
    foreach ($definition in $target.FlictestDefinitions) {
        $siteFilePath = if ($definition.ContainsKey('PathRelativeToTargetDir')) {
            Join-Path $targetRoot $definition.PathRelativeToTargetDir
        }
        else {
            $target.ExePath
        }

        $siteBytes = [System.IO.File]::ReadAllBytes($siteFilePath)
        $resolvedPatternOffset = Find-ResolvedSingleOffset -Bytes $siteBytes -Signature $definition.Signature -GameTitle $target.GameTitle -Label $definition.Label
        $resolvedOffset = $resolvedPatternOffset
        if ($definition.ContainsKey('PatchOffset')) {
            $resolvedOffset += [int]$definition.PatchOffset
        }

        [void]$resolvedFlictestSites.Add(@{
            Label = $definition.Label
            StatusLabel = $definition.StatusLabel
            Offset = $resolvedOffset
            FilePath = $siteFilePath
            Original = $definition.Original
            Enabled = $definition.Enabled
        })
    }

    $target.Sites = $resolvedSites
    $target.EditorVisibilitySites = $resolvedEditorVisibilitySites
    $target.DebuggerSites = @($resolvedDebuggerSites.ToArray())
    $target.FlictestSites = @($resolvedFlictestSites.ToArray())
    $target.StartupConfigPath = Join-Path ([System.IO.Path]::GetDirectoryName($target.ExePath)) $target.StartupConfigName
    return $target
}

$target = Get-ResolvedTarget
$exePath = $target.ExePath

$sites = $target.Sites
$primarySite = $sites[0]
$editorVisibilitySites = $target.EditorVisibilitySites
$debuggerSites = $target.DebuggerSites
$flictestBrowserSites = $target.FlictestSites

$site = @{
    GameTitle = $target.GameTitle
    Mode = $target.Mode
    ExeName = $target.ExeName
    Sites = $sites
}

function Format-HexBytes {
    param([byte[]]$Bytes)

    return (($Bytes | ForEach-Object { $_.ToString('X2') }) -join ' ')
}

function Get-ByteSlice {
    param(
        [byte[]]$Bytes,
        [int]$Offset,
        [int]$Count
    )

    if ($Offset -lt 0 -or ($Offset + $Count) -gt $Bytes.Length) {
        throw ("Requested byte range 0x{0:X}-0x{1:X} is outside the file." -f $Offset, ($Offset + $Count - 1))
    }

    $slice = New-Object byte[] $Count
    [Array]::Copy($Bytes, $Offset, $slice, 0, $Count)
    return $slice
}

function Test-ByteArrayEqual {
    param(
        [byte[]]$Left,
        [byte[]]$Right
    )

    if ($Left.Length -ne $Right.Length) {
        return $false
    }

    for ($i = 0; $i -lt $Left.Length; $i++) {
        if ($Left[$i] -ne $Right[$i]) {
            return $false
        }
    }

    return $true
}

function Get-U16Le {
    param(
        [byte[]]$Bytes,
        [int]$Offset
    )

    return [BitConverter]::ToUInt16($Bytes, $Offset)
}

function Set-U16Le {
    param(
        [byte[]]$Bytes,
        [int]$Offset,
        [int]$Value
    )

    $raw = [BitConverter]::GetBytes([UInt16]$Value)
    [Array]::Copy($raw, 0, $Bytes, $Offset, 2)
}

function Set-ByteSlice {
    param(
        [byte[]]$Bytes,
        [int]$Offset,
        [byte[]]$Value
    )

    [Array]::Copy($Value, 0, $Bytes, $Offset, $Value.Length)
}

function Convert-ToUInt16Value {
    param(
        [string]$Text,
        [string]$Label
    )

    if ([string]::IsNullOrWhiteSpace($Text)) {
        throw "$Label is required."
    }

    $trimmed = $Text.Trim()
    if ($trimmed.StartsWith('0x', [System.StringComparison]::OrdinalIgnoreCase)) {
        return [Convert]::ToUInt16($trimmed.Substring(2), 16)
    }

    return [Convert]::ToUInt16($trimmed, 10)
}

function Convert-ToInt32Value {
    param(
        [string]$Text,
        [string]$Label
    )

    if ([string]::IsNullOrWhiteSpace($Text)) {
        throw "$Label is required."
    }

    $trimmed = $Text.Trim()
    if ($trimmed.StartsWith('0x', [System.StringComparison]::OrdinalIgnoreCase)) {
        return [Convert]::ToInt32($trimmed.Substring(2), 16)
    }

    return [Convert]::ToInt32($trimmed, 10)
}

function Split-CommandLineTokens {
    param([string]$Text)

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return @()
    }

    return @([regex]::Matches($Text.Trim(), '"[^"]+"|\S+') | ForEach-Object { $_.Value })
}

function Format-SoftStartupCommandLine {
    param(
        [string]$Executable,
        [string[]]$OtherTokens,
        [string[]]$WarpValues,
        [string]$EggValue,
        [string]$MapOffValue
    )

    $tokens = New-Object System.Collections.Generic.List[string]
    [void]$tokens.Add($Executable)
    if ($OtherTokens) {
        [void]$tokens.AddRange($OtherTokens)
    }
    if ($WarpValues -and $WarpValues.Count -gt 0) {
        [void]$tokens.Add('-warp')
        [void]$tokens.AddRange($WarpValues)
    }
    if (-not [string]::IsNullOrWhiteSpace($EggValue)) {
        [void]$tokens.Add('-egg')
        [void]$tokens.Add($EggValue)
    }
    if (-not [string]::IsNullOrWhiteSpace($MapOffValue)) {
        [void]$tokens.Add('-mapoff')
        [void]$tokens.Add($MapOffValue)
    }

    return ($tokens -join ' ')
}

function Get-SoftStartupConfig {
    if (-not (Test-Path -LiteralPath $target.StartupConfigPath)) {
        return @{
            Label = 'DOSBox startup config'
            StatusLabel = 'Soft startup config'
            FilePath = $target.StartupConfigPath
            State = 'Missing'
            CommandLine = '<missing>'
            Executable = $target.ExeName
            LineIndex = -1
            Indent = ''
            OtherTokens = @()
            WarpValues = @()
            EggValue = $null
            MapOffValue = $null
        }
    }

    $lines = [System.IO.File]::ReadAllLines($target.StartupConfigPath)
    $lineIndex = -1
    $launchTokens = $null

    for ($index = 0; $index -lt $lines.Count; $index++) {
        $currentLine = $lines[$index]
        if ([string]::IsNullOrWhiteSpace($currentLine) -or $currentLine.TrimStart().StartsWith(';')) {
            continue
        }

        if ($currentLine -notmatch ('(?i)\b{0}\b' -f [regex]::Escape($target.ExeName))) {
            continue
        }

        $candidateTokens = @(Split-CommandLineTokens -Text $currentLine.Trim())
        if ($candidateTokens.Count -gt 0 -and $candidateTokens[0].Trim('"') -ieq $target.ExeName) {
            $lineIndex = $index
            $launchTokens = $candidateTokens
            break
        }
    }

    if ($lineIndex -lt 0 -or -not $launchTokens) {
        return @{
            Label = 'DOSBox startup config'
            StatusLabel = 'Soft startup config'
            FilePath = $target.StartupConfigPath
            State = 'Unknown'
            CommandLine = '<launch line not found>'
            Executable = $target.ExeName
            LineIndex = -1
            Indent = ''
            OtherTokens = @()
            WarpValues = @()
            EggValue = $null
            MapOffValue = $null
        }
    }

    $otherTokens = New-Object System.Collections.Generic.List[string]
    $warpValues = New-Object System.Collections.Generic.List[string]
    $eggValue = $null
    $mapOffValue = $null

    for ($index = 1; $index -lt $launchTokens.Count; $index++) {
        $token = $launchTokens[$index]
        switch ($token.ToLowerInvariant()) {
            '-warp' {
                $index++
                while ($index -lt $launchTokens.Count) {
                    $nextToken = $launchTokens[$index]
                    if ($nextToken -in @('-warp', '-egg', '-mapoff')) {
                        $index--
                        break
                    }

                    [void]$warpValues.Add($nextToken)
                    $index++
                }
                continue
            }
            '-egg' {
                if ($index + 1 -lt $launchTokens.Count) {
                    $eggValue = $launchTokens[$index + 1]
                    $index++
                }
                continue
            }
            '-mapoff' {
                if ($index + 1 -lt $launchTokens.Count) {
                    $mapOffValue = $launchTokens[$index + 1]
                    $index++
                }
                continue
            }
            default {
                [void]$otherTokens.Add($token)
            }
        }
    }

    $commandLine = Format-SoftStartupCommandLine -Executable $launchTokens[0] -OtherTokens $otherTokens.ToArray() -WarpValues $warpValues.ToArray() -EggValue $eggValue -MapOffValue $mapOffValue
    $state = if ($warpValues.Count -gt 0 -or -not [string]::IsNullOrWhiteSpace($eggValue) -or -not [string]::IsNullOrWhiteSpace($mapOffValue)) { 'Custom' } else { 'RetailDefault' }

    return @{
        Label = 'DOSBox startup config'
        StatusLabel = 'Soft startup config'
        FilePath = $target.StartupConfigPath
        State = $state
        CommandLine = $commandLine
        Executable = $launchTokens[0]
        LineIndex = $lineIndex
        Indent = ([regex]::Match($lines[$lineIndex], '^\s*')).Value
        OtherTokens = @($otherTokens.ToArray())
        WarpValues = @($warpValues.ToArray())
        EggValue = $eggValue
        MapOffValue = $mapOffValue
    }
}

function Format-SoftStartupStatus {
    param([hashtable]$Config)

    switch ($Config.State) {
        'RetailDefault' { return ('Retail default ({0})' -f $Config.CommandLine) }
        'Custom' { return ('Custom ({0})' -f $Config.CommandLine) }
        'Missing' { return ('Missing ({0})' -f $Config.FilePath) }
        default { return ('Unknown ({0})' -f $Config.CommandLine) }
    }
}

function Assert-SoftStartupKnown {
    $config = Get-SoftStartupConfig
    if ($config.State -notin @('RetailDefault', 'Custom')) {
        throw (
            "The DOSBox startup config does not contain a recognized launch line for {0}.`nPath: {1}`nState: {2}`n`nRefusing to modify an unknown config state." -f
            $target.ExeName,
            $config.FilePath,
            $config.State
        )
    }
}

function Read-SoftStartupValue {
    param(
        [string]$Prompt,
        [string]$CurrentValue,
        [string]$Label,
        [bool]$AllowMultiple = $false
    )

    while ($true) {
        Write-ColorLine -Text $Prompt -Color Cyan
        if (-not [string]::IsNullOrWhiteSpace($CurrentValue)) {
            Write-PlainLine ('Current: {0}' -f $CurrentValue)
        }

        $text = Read-Host
        $trimmed = $text.Trim()
        if ($trimmed.ToLowerInvariant() -eq 'b' -or $trimmed.ToLowerInvariant() -eq 'q') {
            return @{ Cancelled = $true }
        }

        if ([string]::IsNullOrWhiteSpace($text)) {
            return @{ Cancelled = $false; Value = $null }
        }

        if ($AllowMultiple) {
            $parts = @([regex]::Split($text.Trim(), '\s+') | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
            if ($parts.Count -eq 0 -or $parts.Count -gt 4) {
                Write-Warning ('{0} must contain 1 to 4 numbers separated by spaces.' -f $Label)
                continue
            }

            $values = New-Object System.Collections.Generic.List[string]
            foreach ($part in $parts) {
                $parsedValue = Convert-ToInt32Value -Text $part -Label $Label
                [void]$values.Add($parsedValue.ToString())
            }

            return @{ Cancelled = $false; Value = @($values.ToArray()) }
        }

        $parsed = Convert-ToInt32Value -Text $text -Label $Label
        return @{ Cancelled = $false; Value = $parsed.ToString() }
    }
}

function Set-SoftStartupConfig {
    param(
        [string[]]$WarpValues,
        [string]$EggValue,
        [string]$MapOffValue,
        [string]$Label
    )

    Assert-SoftStartupKnown

    $config = Get-SoftStartupConfig
    $lines = [System.IO.File]::ReadAllLines($config.FilePath)
    $newCommandLine = Format-SoftStartupCommandLine -Executable $config.Executable -OtherTokens $config.OtherTokens -WarpValues $WarpValues -EggValue $EggValue -MapOffValue $MapOffValue
    $lines[$config.LineIndex] = ($config.Indent + $newCommandLine)
    [System.IO.File]::WriteAllLines($config.FilePath, $lines, [System.Text.UTF8Encoding]::new($false))

    $verifyConfig = Get-SoftStartupConfig
    if ($verifyConfig.State -eq 'Unknown') {
        throw 'Soft startup config verification failed after write.'
    }

    Write-Host ''
    Write-Host ('Applied: {0}' -f $Label)
    Write-Host ('{0}: {1}' -f $verifyConfig.StatusLabel, (Format-SoftStartupStatus -Config $verifyConfig))
    Write-Host ''
}

function Invoke-SoftStartupEditor {
    $config = Get-SoftStartupConfig
    if ($config.State -eq 'Missing') {
        throw ('DOSBox startup config not found: {0}' -f $config.FilePath)
    }

    if ($config.State -eq 'Unknown') {
        Assert-SoftStartupKnown
    }

    Write-Host ''
    Write-PlainLine 'DOSBox startup config'
    Write-PlainLine '---------------------'
    Write-PlainLine ('Config: {0}' -f $config.FilePath)
    Write-StatusLine -Label 'Launch line' -Value $config.CommandLine -Patched ($config.State -eq 'Custom')
    $warpPresent = ($null -ne $config.WarpValues -and @($config.WarpValues).Count -gt 0)
    $eggPresent = -not [string]::IsNullOrWhiteSpace($config.EggValue)
    $mapOffPresent = -not [string]::IsNullOrWhiteSpace($config.MapOffValue)
    $warpValueText = if ($warpPresent) { '-warp ' + ($config.WarpValues -join ' ') } else { '<none>' }
    $eggValueText = if ($eggPresent) { '-egg ' + $config.EggValue } else { '<none>' }
    $mapOffValueText = if ($mapOffPresent) { '-mapoff ' + $config.MapOffValue } else { '<none>' }
    Write-StatusLine -Label '-warp' -Value $warpValueText -Patched $warpPresent
    Write-StatusLine -Label '-egg' -Value $eggValueText -Patched $eggPresent
    Write-StatusLine -Label '-mapoff' -Value $mapOffValueText -Patched $mapOffPresent
    if ($warpPresent -and @($config.WarpValues).Count -gt 1 -and $eggPresent) {
        Write-ColorLine -Text 'Note: if -egg is set, any x y z values in -warp are ignored by the game.' -Color Yellow
    }
    Write-Host ''

    if ($config.WarpValues.Count -gt 0 -or -not [string]::IsNullOrWhiteSpace($config.EggValue) -or -not [string]::IsNullOrWhiteSpace($config.MapOffValue)) {
        Write-MenuEntry -Text '1. Change values' -Kind 'patch'
        Write-MenuEntry -Text '2. Reset to retail defaults' -Kind 'restore'
        Write-PlainLine 'b. Back'
        Write-PlainLine 'q. Quit'
        Write-Host ''
        $selection = Read-Host 'Select 1, 2, b, or q'
        switch ($selection.Trim().ToLowerInvariant()) {
            '1' {
                $currentWarpValue = if ($warpPresent) { $config.WarpValues -join ' ' } else { $null }
                $warpInput = Read-SoftStartupValue -Prompt 'Enter -warp as level [x [y [z]]] (blank removes it)' -CurrentValue $currentWarpValue -Label '-warp' -AllowMultiple $true
                if ($warpInput.Cancelled) {
                    return
                }

                $warpInputCount = if ($null -ne $warpInput.Value) { @($warpInput.Value).Count } else { 0 }

                $currentEggValue = if ($eggPresent) { $config.EggValue } else { $null }
                $eggInput = Read-SoftStartupValue -Prompt 'Enter -egg value (blank removes it)' -CurrentValue $currentEggValue -Label '-egg'
                if ($eggInput.Cancelled) {
                    return
                }

                if ($warpInputCount -gt 1 -and -not [string]::IsNullOrWhiteSpace($eggInput.Value)) {
                    Write-ColorLine -Text 'Warning: -egg overrides any x y z values from -warp.' -Color Yellow
                }

                $currentMapOffValue = if ($mapOffPresent) { $config.MapOffValue } else { $null }
                $mapOffInput = Read-SoftStartupValue -Prompt 'Enter -mapoff value (blank removes it)' -CurrentValue $currentMapOffValue -Label '-mapoff'
                if ($mapOffInput.Cancelled) {
                    return
                }

                Set-SoftStartupConfig -WarpValues $warpInput.Value -EggValue $eggInput.Value -MapOffValue $mapOffInput.Value -Label 'Update DOSBox startup arguments'
                return
            }
            '2' {
                Set-SoftStartupConfig -WarpValues @() -EggValue $null -MapOffValue $null -Label 'Restore retail DOSBox startup defaults'
                return
            }
            'b' {
                return
            }
            'q' {
                return
            }
            default {
                Write-Warning 'Invalid selection.'
                return
            }
        }
    }
    else {
        Write-MenuEntry -Text '1. Add values' -Kind 'patch'
        Write-PlainLine 'b. Back'
        Write-PlainLine 'q. Quit'
        Write-Host ''
        $selection = Read-Host 'Select 1, b, or q'
        switch ($selection.Trim().ToLowerInvariant()) {
            '1' {
                $warpInput = Read-SoftStartupValue -Prompt 'Enter -warp as level [x [y [z]]] (blank leaves it out)' -CurrentValue $null -Label '-warp' -AllowMultiple $true
                if ($warpInput.Cancelled) {
                    return
                }

                $warpInputCount = if ($null -ne $warpInput.Value) { @($warpInput.Value).Count } else { 0 }

                $eggInput = Read-SoftStartupValue -Prompt 'Enter -egg value (blank leaves it out)' -CurrentValue $null -Label '-egg'
                if ($eggInput.Cancelled) {
                    return
                }

                if ($warpInputCount -gt 1 -and -not [string]::IsNullOrWhiteSpace($eggInput.Value)) {
                    Write-ColorLine -Text 'Warning: -egg overrides any x y z values from -warp.' -Color Yellow
                }

                $mapOffInput = Read-SoftStartupValue -Prompt 'Enter -mapoff value (blank leaves it out)' -CurrentValue $null -Label '-mapoff'
                if ($mapOffInput.Cancelled) {
                    return
                }

                Set-SoftStartupConfig -WarpValues $warpInput.Value -EggValue $eggInput.Value -MapOffValue $mapOffInput.Value -Label 'Add DOSBox startup arguments'
                return
            }
            'b' {
                return
            }
            'q' {
                return
            }
            default {
                Write-Warning 'Invalid selection.'
                return
            }
        }
    }
}

function New-FirstMissionStartBytes {
    param(
        [int]$Map,
        [int]$Egg
    )

    $bytes = [byte[]]$primarySite.Original.Clone()
    Set-U16Le -Bytes $bytes -Offset 4 -Value $Map
    Set-U16Le -Bytes $bytes -Offset 6 -Value $Egg
    return $bytes
}

function Get-FirstMissionStartConfig {
    param(
        [byte[]]$FileBytes,
        [hashtable]$SiteDefinition = $primarySite
    )

    $current = Get-ByteSlice -Bytes $FileBytes -Offset $SiteDefinition.Offset -Count $SiteDefinition.Original.Length
    $prefix = Get-ByteSlice -Bytes $current -Offset 0 -Count $SiteDefinition.Prefix.Length
    if (-not (Test-ByteArrayEqual -Left $prefix -Right $SiteDefinition.Prefix)) {
        return @{
            Label = $SiteDefinition.Label
            StatusLabel = $SiteDefinition.StatusLabel
            State = 'Unknown'
            Bytes = $current
        }
    }

    $map = Get-U16Le -Bytes $current -Offset 4
    $egg = Get-U16Le -Bytes $current -Offset 6
    $state = if ($map -eq $SiteDefinition.DefaultMap -and $egg -eq $SiteDefinition.DefaultEgg) { 'Original' } else { 'Custom' }

    return @{
        Label = $SiteDefinition.Label
        StatusLabel = $SiteDefinition.StatusLabel
        State = $state
        Map = $map
        Egg = $egg
        Bytes = $current
    }
}

function Format-FirstMissionStartStatus {
    param([hashtable]$Config)

    if ($Config.State -eq 'Unknown') {
        return ('Unknown ({0})' -f (Format-HexBytes -Bytes $Config.Bytes))
    }

    return ('{0} (map {1}, egg 0x{2:X4})' -f $Config.State, $Config.Map, $Config.Egg)
}

function Assert-FirstMissionStartKnown {
    param([byte[]]$FileBytes)

    foreach ($siteDefinition in $sites) {
        $config = Get-FirstMissionStartConfig -FileBytes $FileBytes -SiteDefinition $siteDefinition
        if ($config.State -eq 'Unknown') {
            throw (
                "{0} at file offset 0x{1:X} does not match the expected startup push pattern.`nCurrent : {2}`nExpected prefix: {3}`n`nRefusing to modify an unknown executable state." -f
                $siteDefinition.Label,
                $siteDefinition.Offset,
                (Format-HexBytes -Bytes $config.Bytes),
                (Format-HexBytes -Bytes $siteDefinition.Prefix)
            )
        }
    }
}

function Get-EditorVisibilityConfig {
    param([byte[]]$FileBytes)

    $siteStates = @(
        foreach ($siteDefinition in $editorVisibilitySites) {
            $current = Get-ByteSlice -Bytes $FileBytes -Offset $siteDefinition.Offset -Count $siteDefinition.Original.Length
            $state = 'Unknown'
            if (Test-ByteArrayEqual -Left $current -Right $siteDefinition.Original) {
                $state = 'RetailHidden'
            }
            elseif (Test-ByteArrayEqual -Left $current -Right $siteDefinition.Enabled) {
                $state = 'ForcedVisible'
            }

            @{
                Label = $siteDefinition.Label
                StatusLabel = $siteDefinition.StatusLabel
                Offset = $siteDefinition.Offset
                State = $state
                Bytes = $current
            }
        }
    )

    $unknownStates = @($siteStates | Where-Object { $_.State -eq 'Unknown' })
    $retailHiddenStates = @($siteStates | Where-Object { $_.State -eq 'RetailHidden' })
    $forcedVisibleStates = @($siteStates | Where-Object { $_.State -eq 'ForcedVisible' })

    $overallState = 'Mixed'
    if ($unknownStates.Count -gt 0) {
        $overallState = 'Unknown'
    }
    elseif ($retailHiddenStates.Count -eq $siteStates.Count) {
        $overallState = 'RetailHidden'
    }
    elseif ($forcedVisibleStates.Count -eq $siteStates.Count) {
        $overallState = 'ForcedVisible'
    }
    return @{
        Label = 'Editor-object visibility toggle'
        StatusLabel = 'Editor-object visibility'
        State = $overallState
        Sites = $siteStates
    }
}

function Format-EditorVisibilityStatus {
    param([hashtable]$Config)

    switch ($Config.State) {
        'RetailHidden' { return 'Retail hidden' }
        'ForcedVisible' { return 'Forced visible' }
        'Mixed' { return 'Mixed' }
        default { return 'Unknown' }
    }
}

function Assert-EditorVisibilityKnown {
    param([byte[]]$FileBytes)

    $config = Get-EditorVisibilityConfig -FileBytes $FileBytes
    if ($config.State -eq 'Unknown') {
        $details = ($config.Sites | ForEach-Object {
            "{0} @ 0x{1:X}: {2}" -f $_.StatusLabel, $_.Offset, (Format-HexBytes -Bytes $_.Bytes)
        }) -join "`n"
        throw (
            "Editor visibility sites do not match the expected retail or forced-visible bytes.`n{0}`n`nRefusing to modify an unknown executable state." -f
            $details
        )
    }
}

function Get-DebuggerConfig {

    if (-not $debuggerSites -or $debuggerSites.Count -eq 0) {
        return $null
    }

    $siteStates = @(
        foreach ($siteDefinition in $debuggerSites) {
            $siteBytes = [System.IO.File]::ReadAllBytes($siteDefinition.FilePath)
            $current = Get-ByteSlice -Bytes $siteBytes -Offset $siteDefinition.Offset -Count $siteDefinition.Original.Length
            $state = 'Unknown'
            if (Test-ByteArrayEqual -Left $current -Right $siteDefinition.Original) {
                $state = 'RetailDefault'
            }
            elseif (Test-ByteArrayEqual -Left $current -Right $siteDefinition.Enabled) {
                $state = 'DebuggerEnabled'
            }

            @{
                Label = $siteDefinition.Label
                StatusLabel = $siteDefinition.StatusLabel
                FilePath = $siteDefinition.FilePath
                Offset = $siteDefinition.Offset
                State = $state
                Bytes = $current
            }
        }
    )

    $unknownStates = @($siteStates | Where-Object { $_.State -eq 'Unknown' })
    $retailStates = @($siteStates | Where-Object { $_.State -eq 'RetailDefault' })
    $enabledStates = @($siteStates | Where-Object { $_.State -eq 'DebuggerEnabled' })

    $overallState = 'Mixed'
    if ($unknownStates.Count -gt 0) {
        $overallState = 'Unknown'
    }
    elseif ($retailStates.Count -eq $siteStates.Count) {
        $overallState = 'RetailDefault'
    }
    elseif ($enabledStates.Count -eq $siteStates.Count) {
        $overallState = 'DebuggerEnabled'
    }

    return @{
        Label = 'No Regret loosecannon debugger patch'
        StatusLabel = 'No Regret loosecannon debugger'
        State = $overallState
        Sites = $siteStates
    }
}

function Format-DebuggerStatus {
    param([hashtable]$Config)

    switch ($Config.State) {
        'RetailDefault' { return 'Retail default' }
        'DebuggerEnabled' { return 'Debugger enabled' }
        'Mixed' { return 'Mixed' }
        default { return 'Unknown' }
    }
}

function Assert-DebuggerKnown {
    if (-not $debuggerSites -or $debuggerSites.Count -eq 0) {
        throw 'The active game does not expose the No Regret loosecannon debugger patch.'
    }

    $config = Get-DebuggerConfig
    if ($config.State -eq 'Unknown') {
        $details = ($config.Sites | ForEach-Object {
            "{0} @ 0x{1:X}: {2}" -f $_.StatusLabel, $_.Offset, (Format-HexBytes -Bytes $_.Bytes)
        }) -join "`n"
        throw (
            "No Regret loosecannon debugger sites do not match the expected retail or debugger-enabled bytes.`n{0}`n`nRefusing to modify an unknown executable state." -f
            $details
        )
    }
}

function Get-FlictestBrowserConfig {

    if (-not $flictestBrowserSites -or $flictestBrowserSites.Count -eq 0) {
        return $null
    }

    $siteStates = @(
        foreach ($siteDefinition in $flictestBrowserSites) {
            $siteBytes = [System.IO.File]::ReadAllBytes($siteDefinition.FilePath)
            $current = Get-ByteSlice -Bytes $siteBytes -Offset $siteDefinition.Offset -Count $siteDefinition.Original.Length
            $state = 'Unknown'
            if (Test-ByteArrayEqual -Left $current -Right $siteDefinition.Original) {
                $state = 'RetailDefault'
            }
            elseif (Test-ByteArrayEqual -Left $current -Right $siteDefinition.Enabled) {
                $state = 'BrowserEnabled'
            }

            @{
                Label = $siteDefinition.Label
                StatusLabel = $siteDefinition.StatusLabel
                FilePath = $siteDefinition.FilePath
                Offset = $siteDefinition.Offset
                State = $state
                Bytes = $current
            }
        }
    )

    $unknownStates = @($siteStates | Where-Object { $_.State -eq 'Unknown' })
    $retailStates = @($siteStates | Where-Object { $_.State -eq 'RetailDefault' })
    $enabledStates = @($siteStates | Where-Object { $_.State -eq 'BrowserEnabled' })

    $overallState = 'Mixed'
    if ($unknownStates.Count -gt 0) {
        $overallState = 'Unknown'
    }
    elseif ($retailStates.Count -eq $siteStates.Count) {
        $overallState = 'RetailDefault'
    }
    elseif ($enabledStates.Count -eq $siteStates.Count) {
        $overallState = 'BrowserEnabled'
    }

    return @{
        Label = 'Remorse datalink movie-browser patch'
        StatusLabel = 'Remorse datalink movie-browser'
        State = $overallState
        Sites = $siteStates
    }
}

function Format-FlictestBrowserStatus {
    param([hashtable]$Config)

    switch ($Config.State) {
        'RetailDefault' { return 'Retail default' }
        'BrowserEnabled' { return 'Browser enabled' }
        'Mixed' { return 'Mixed' }
        default { return 'Unknown' }
    }
}

function Assert-FlictestBrowserKnown {
    if (-not $flictestBrowserSites -or $flictestBrowserSites.Count -eq 0) {
        throw 'The active game does not expose the Remorse datalink movie-browser patch.'
    }

    $config = Get-FlictestBrowserConfig
    if ($config.State -eq 'Unknown') {
        $details = ($config.Sites | ForEach-Object {
            "{0} @ 0x{1:X}: {2}" -f $_.StatusLabel, $_.Offset, (Format-HexBytes -Bytes $_.Bytes)
        }) -join "`n"
        throw (
            "Remorse datalink movie-browser sites do not match the expected retail or browser-enabled bytes.`n{0}`n`nRefusing to modify an unknown executable state." -f
            $details
        )
    }
}

function Write-ColorLine {
    param(
        [string]$Text,
        [ConsoleColor]$Color
    )

    Write-Host $Text -ForegroundColor $Color
}

function Write-PlainLine {
    param([string]$Text)

    Write-Host $Text
}

function Write-StatusLine {
    param(
        [string]$Label,
        [string]$Value,
        [bool]$Patched = $false
    )

    if ($Patched) {
        Write-Host ("{0}: " -f $Label) -NoNewline
        Write-ColorLine -Text $Value -Color Green
        return
    }

    Write-PlainLine ("{0}: {1}" -f $Label, $Value)
}

function Write-MenuEntry {
    param(
        [string]$Text,
        [string]$Kind = 'neutral'
    )

    switch ($Kind) {
        'patch' { Write-ColorLine -Text $Text -Color Blue }
        'restore' { Write-ColorLine -Text $Text -Color Red }
        default { Write-PlainLine $Text }
    }
}

function Show-Documentation {
    Write-Host ''
    Write-PlainLine 'How it works:'
    Write-PlainLine '- The script auto-detects CRUSADER.EXE or REGRET.EXE in this folder.'
    Write-PlainLine '- It resolves each patch site by scanning for the hardcoded selector signature used by that game.'
    Write-PlainLine '- Startup selector resolution now wildcards the current map/egg bytes so status and restore still work after a prior redirect.'
    Write-PlainLine '- In No Regret, the script patches both the menu-start selector and the later mission-start selector used for an actual new game.'
    Write-PlainLine '- The script reads 8 bytes at each matched selector call site.'
    Write-PlainLine '- Bytes 0-3 must remain 6A 01 66 68, which is the instruction prefix this patch expects.'
    Write-PlainLine '- Bytes 4-5 are the little-endian startup map number.'
    Write-PlainLine '- Bytes 6-7 are the little-endian startup egg id.'
    Write-PlainLine '- Redirect changes only those two 16-bit values at each matched selector and leaves the rest of the executable alone.'
    Write-PlainLine '- Restore writes the retail values back everywhere: map 1, egg 0x001E.'
    Write-PlainLine '- The editor visibility patch flips both recovered SI_EDITOR branches from 74 03 to EB 03: the upstream world-item node-allocation skip and the downstream sprite-paint skip.'
    Write-PlainLine '- The DOSBox soft-startup editor updates dosboxREGRET_single.conf or dosboxCRUSADER_single.conf instead of touching the executable.'
    Write-PlainLine '- In that editor, blank input removes a managed argument, b returns to the main menu without saving, and q quits without saving.'
    Write-PlainLine '- The -warp field accepts level [x [y [z]]] and the editor warns that any x y z values are ignored when -egg is present.'
    if ($debuggerSites.Count -gt 0) {
        Write-PlainLine '- The No Regret loosecannon debugger patch rewrites the documented fixup records at 0x7BB25, 0x7BB05, and 0x7BB15 to bootstrap the debugger and replace the active-cheat dialog with usecode_debugger_open_modal.'
        Write-PlainLine '- Restore writes the retail fixup targets back verbatim, disabling the loosecannon debugger hook.'
    }
    if ($flictestBrowserSites.Count -gt 0) {
        Write-PlainLine '- The Remorse datalink movie-browser patch edits USECODE\EUSECODE.FLX and swaps the final DATALINK::use slot_20 callee from TEXTFILE (0x0A17) to FLICTEST (0x0A20).'
        Write-PlainLine '- That exposes the shipped FLICTEST keypad browser through the datalink with only a 2-byte usecode change.'
    }
    Write-Host ''
}

function Show-Status {
    param([byte[]]$FileBytes)

    $configs = @(
        foreach ($siteDefinition in $sites) {
            Get-FirstMissionStartConfig -FileBytes $FileBytes -SiteDefinition $siteDefinition
        }
    )

    Write-Host ''
    Write-PlainLine 'Crusader map-load patch status'
    Write-PlainLine '-----------------------------'
    Write-PlainLine ("Game: {0}" -f $site.GameTitle)
    Write-PlainLine ("Mode: {0}" -f $site.Mode)
    Write-PlainLine ("EXE: {0}" -f $exePath)
    $startupConfig = Get-SoftStartupConfig
    Write-StatusLine -Label $startupConfig.StatusLabel -Value (Format-SoftStartupStatus -Config $startupConfig) -Patched ($startupConfig.State -eq 'Custom')
    foreach ($config in $configs) {
        $siteDefinition = $sites | Where-Object { $_.Label -eq $config.Label } | Select-Object -First 1
        $patched = $config.State -eq 'Custom'
        Write-StatusLine -Label ("{0} @ 0x{1:X}" -f $config.StatusLabel, $siteDefinition.Offset) -Value (Format-FirstMissionStartStatus -Config $config) -Patched $patched
        Write-PlainLine ("{0} Ghidra push: {1}" -f $config.StatusLabel, $siteDefinition.GhidraSelectorPush)
        Write-PlainLine ("{0} Ghidra call: {1}" -f $config.StatusLabel, $siteDefinition.GhidraSelectorCall)
    }
    $editorVisibilityConfig = Get-EditorVisibilityConfig -FileBytes $FileBytes
    Write-StatusLine -Label $editorVisibilityConfig.StatusLabel -Value (Format-EditorVisibilityStatus -Config $editorVisibilityConfig) -Patched ($editorVisibilityConfig.State -eq 'ForcedVisible')
    foreach ($siteConfig in $editorVisibilityConfig.Sites) {
        Write-StatusLine -Label ("{0} @ 0x{1:X}" -f $siteConfig.StatusLabel, $siteConfig.Offset) -Value (Format-EditorVisibilityStatus -Config $siteConfig) -Patched ($siteConfig.State -eq 'ForcedVisible')
    }
    if ($debuggerSites.Count -gt 0) {
        $debuggerConfig = Get-DebuggerConfig
        Write-StatusLine -Label $debuggerConfig.StatusLabel -Value (Format-DebuggerStatus -Config $debuggerConfig) -Patched ($debuggerConfig.State -eq 'DebuggerEnabled')
        foreach ($siteConfig in $debuggerConfig.Sites) {
            Write-StatusLine -Label ("{0} @ 0x{1:X}" -f $siteConfig.StatusLabel, $siteConfig.Offset) -Value (Format-DebuggerStatus -Config $siteConfig) -Patched ($siteConfig.State -eq 'DebuggerEnabled')
        }
    }
    if ($flictestBrowserSites.Count -gt 0) {
        $flictestConfig = Get-FlictestBrowserConfig
        Write-StatusLine -Label $flictestConfig.StatusLabel -Value (Format-FlictestBrowserStatus -Config $flictestConfig) -Patched ($flictestConfig.State -eq 'BrowserEnabled')
        foreach ($siteConfig in $flictestConfig.Sites) {
            Write-StatusLine -Label ("{0} @ 0x{1:X}" -f $siteConfig.StatusLabel, $siteConfig.Offset) -Value (Format-FlictestBrowserStatus -Config $siteConfig) -Patched ($siteConfig.State -eq 'BrowserEnabled')
        }
    }
    Write-Host ''
    Write-PlainLine '1. Show status'
    Write-MenuEntry -Text '2. Redirect fresh-game startup map/egg' -Kind 'patch'
    Write-MenuEntry -Text '3. Restore retail default' -Kind 'restore'
    Write-MenuEntry -Text '4. Force editor objects visible' -Kind 'patch'
    Write-MenuEntry -Text '5. Restore retail editor-object hide' -Kind 'restore'
    if ($debuggerSites.Count -gt 0) {
        Write-MenuEntry -Text '6. Enable No Regret loosecannon debugger' -Kind 'patch'
        Write-MenuEntry -Text '7. Restore retail No Regret loosecannon behavior' -Kind 'restore'
        Write-MenuEntry -Text '8. Edit DOSBox startup arguments' -Kind 'patch'
        Write-PlainLine '9. Documentation'
        Write-PlainLine '10. Exit'
    }
    elseif ($flictestBrowserSites.Count -gt 0) {
        Write-MenuEntry -Text '6. Enable Remorse datalink movie browser' -Kind 'patch'
        Write-MenuEntry -Text '7. Restore retail Remorse datalink use' -Kind 'restore'
        Write-MenuEntry -Text '8. Edit DOSBox startup arguments' -Kind 'patch'
        Write-PlainLine '9. Documentation'
        Write-PlainLine '10. Exit'
    }
    else {
        Write-MenuEntry -Text '6. Edit DOSBox startup arguments' -Kind 'patch'
        Write-PlainLine '7. Documentation'
        Write-PlainLine '8. Exit'
    }
    Write-Host ''
}

function Set-FirstMissionStartConfig {
    param(
        [int]$Map,
        [int]$Egg,
        [string]$Label
    )

    $fileBytes = [System.IO.File]::ReadAllBytes($exePath)
    Assert-FirstMissionStartKnown -FileBytes $fileBytes

    $targetBytes = New-FirstMissionStartBytes -Map $Map -Egg $Egg
    foreach ($siteDefinition in $sites) {
        Set-ByteSlice -Bytes $fileBytes -Offset $siteDefinition.Offset -Value $targetBytes
    }
    [System.IO.File]::WriteAllBytes($exePath, $fileBytes)

    $verifyBytes = [System.IO.File]::ReadAllBytes($exePath)
    foreach ($siteDefinition in $sites) {
        $verified = Get-ByteSlice -Bytes $verifyBytes -Offset $siteDefinition.Offset -Count $targetBytes.Length
        if (-not (Test-ByteArrayEqual -Left $verified -Right $targetBytes)) {
            throw ("{0} verification failed after write." -f $siteDefinition.Label)
        }
    }

    $configs = @(
        foreach ($siteDefinition in $sites) {
            Get-FirstMissionStartConfig -FileBytes $verifyBytes -SiteDefinition $siteDefinition
        }
    )
    Write-Host ''
    Write-Host ("Applied: {0}" -f $Label)
    foreach ($config in $configs) {
        $siteDefinition = $sites | Where-Object { $_.Label -eq $config.Label } | Select-Object -First 1
        Write-Host ("{0} @ 0x{1:X}: {2}" -f $config.StatusLabel, $siteDefinition.Offset, (Format-FirstMissionStartStatus -Config $config))
    }
    Write-Host ''
}

function Set-EditorVisibilityEnabled {
    param(
        [bool]$Enabled,
        [string]$Label
    )

    $fileBytes = [System.IO.File]::ReadAllBytes($exePath)
    Assert-EditorVisibilityKnown -FileBytes $fileBytes

    foreach ($siteDefinition in $editorVisibilitySites) {
        $targetBytes = if ($Enabled) { $siteDefinition.Enabled } else { $siteDefinition.Original }
        Set-ByteSlice -Bytes $fileBytes -Offset $siteDefinition.Offset -Value $targetBytes
    }
    [System.IO.File]::WriteAllBytes($exePath, $fileBytes)

    $verifyBytes = [System.IO.File]::ReadAllBytes($exePath)
    foreach ($siteDefinition in $editorVisibilitySites) {
        $targetBytes = if ($Enabled) { $siteDefinition.Enabled } else { $siteDefinition.Original }
        $verified = Get-ByteSlice -Bytes $verifyBytes -Offset $siteDefinition.Offset -Count $targetBytes.Length
        if (-not (Test-ByteArrayEqual -Left $verified -Right $targetBytes)) {
            throw ("{0} verification failed after write." -f $siteDefinition.Label)
        }
    }

    $config = Get-EditorVisibilityConfig -FileBytes $verifyBytes
    Write-Host ''
    Write-Host ("Applied: {0}" -f $Label)
    Write-Host ("{0} @ {1}" -f $config.StatusLabel, (Format-EditorVisibilityStatus -Config $config))
    foreach ($siteConfig in $config.Sites) {
        Write-Host ("{0} @ 0x{1:X}: {2}" -f $siteConfig.StatusLabel, $siteConfig.Offset, (Format-EditorVisibilityStatus -Config $siteConfig))
    }
    Write-Host ''
}

function Set-DebuggerEnabled {
    param(
        [bool]$Enabled,
        [string]$Label
    )

    Assert-DebuggerKnown

    foreach ($siteDefinition in $debuggerSites) {
        $fileBytes = [System.IO.File]::ReadAllBytes($siteDefinition.FilePath)
        $targetBytes = if ($Enabled) { $siteDefinition.Enabled } else { $siteDefinition.Original }
        Set-ByteSlice -Bytes $fileBytes -Offset $siteDefinition.Offset -Value $targetBytes
        [System.IO.File]::WriteAllBytes($siteDefinition.FilePath, $fileBytes)

        $verifyBytes = [System.IO.File]::ReadAllBytes($siteDefinition.FilePath)
        $verified = Get-ByteSlice -Bytes $verifyBytes -Offset $siteDefinition.Offset -Count $targetBytes.Length
        if (-not (Test-ByteArrayEqual -Left $verified -Right $targetBytes)) {
            throw ("{0} verification failed after write." -f $siteDefinition.Label)
        }
    }

    $config = Get-DebuggerConfig
    Write-Host ''
    Write-Host ("Applied: {0}" -f $Label)
    Write-Host ("{0}: {1}" -f $config.StatusLabel, (Format-DebuggerStatus -Config $config))
    foreach ($siteConfig in $config.Sites) {
        Write-Host ("{0} @ 0x{1:X}: {2}" -f $siteConfig.StatusLabel, $siteConfig.Offset, (Format-DebuggerStatus -Config $siteConfig))
    }
    Write-Host ''
}

function Set-FlictestBrowserEnabled {
    param(
        [bool]$Enabled,
        [string]$Label
    )

    Assert-FlictestBrowserKnown

    foreach ($siteDefinition in $flictestBrowserSites) {
        $fileBytes = [System.IO.File]::ReadAllBytes($siteDefinition.FilePath)
        $targetBytes = if ($Enabled) { $siteDefinition.Enabled } else { $siteDefinition.Original }
        Set-ByteSlice -Bytes $fileBytes -Offset $siteDefinition.Offset -Value $targetBytes
        [System.IO.File]::WriteAllBytes($siteDefinition.FilePath, $fileBytes)

        $verifyBytes = [System.IO.File]::ReadAllBytes($siteDefinition.FilePath)
        $verified = Get-ByteSlice -Bytes $verifyBytes -Offset $siteDefinition.Offset -Count $targetBytes.Length
        if (-not (Test-ByteArrayEqual -Left $verified -Right $targetBytes)) {
            throw ("{0} verification failed after write." -f $siteDefinition.Label)
        }
    }

    $config = Get-FlictestBrowserConfig
    Write-Host ''
    Write-Host ("Applied: {0}" -f $Label)
    Write-Host ("{0}: {1}" -f $config.StatusLabel, (Format-FlictestBrowserStatus -Config $config))
    foreach ($siteConfig in $config.Sites) {
        Write-Host ("{0} @ 0x{1:X}: {2}" -f $siteConfig.StatusLabel, $siteConfig.Offset, (Format-FlictestBrowserStatus -Config $siteConfig))
    }
    Write-Host ''
}

function Read-FirstMissionRedirectInput {
    param([hashtable]$CurrentConfig)

    $mapText = Read-Host 'Enter fresh-game startup map number (decimal or 0x-prefixed hex)'
    $map = Convert-ToUInt16Value -Text $mapText -Label 'First mission map'

    $defaultEgg = [int]$CurrentConfig.Egg
    $eggText = Read-Host ('Enter teleport egg id (blank keeps 0x{0:X4})' -f $defaultEgg)
    $egg = if ([string]::IsNullOrWhiteSpace($eggText)) {
        $defaultEgg
    }
    else {
        Convert-ToUInt16Value -Text $eggText -Label 'First mission egg'
    }

    return @{
        Map = $map
        Egg = $egg
    }
}

function Invoke-MenuChoice {
    param([string]$SelectedChoice)

    switch ($SelectedChoice.Trim().ToLowerInvariant()) {
        '1' {
            $currentBytes = [System.IO.File]::ReadAllBytes($exePath)
            Show-Status -FileBytes $currentBytes
        }
        'status' {
            $currentBytes = [System.IO.File]::ReadAllBytes($exePath)
            Show-Status -FileBytes $currentBytes
        }
        '2' {
            $fileBytes = [System.IO.File]::ReadAllBytes($exePath)
            Assert-FirstMissionStartKnown -FileBytes $fileBytes
            $currentConfig = Get-FirstMissionStartConfig -FileBytes $fileBytes

            if ($script:CliParameterState.HasFirstMissionMap) {
                $map = [int]$FirstMissionMap
                $egg = if ($script:CliParameterState.HasFirstMissionEgg) {
                    [int]$FirstMissionEgg.Value
                }
                else {
                    [int]$currentConfig.Egg
                }
            }
            else {
                $inputValues = Read-FirstMissionRedirectInput -CurrentConfig $currentConfig
                $map = [int]$inputValues.Map
                $egg = [int]$inputValues.Egg
            }

            Set-FirstMissionStartConfig -Map $map -Egg $egg -Label ('Redirect fresh-game startup to map {0}, egg 0x{1:X4}' -f $map, $egg)
        }
        'map-redirect' {
            $fileBytes = [System.IO.File]::ReadAllBytes($exePath)
            Assert-FirstMissionStartKnown -FileBytes $fileBytes
            $currentConfig = Get-FirstMissionStartConfig -FileBytes $fileBytes

            if (-not $script:CliParameterState.HasFirstMissionMap) {
                throw 'Choice map-redirect requires -FirstMissionMap, or use interactive option 2.'
            }

            $map = [int]$FirstMissionMap
            $egg = if ($script:CliParameterState.HasFirstMissionEgg) {
                [int]$FirstMissionEgg.Value
            }
            else {
                [int]$currentConfig.Egg
            }

            Set-FirstMissionStartConfig -Map $map -Egg $egg -Label ('Redirect fresh-game startup to map {0}, egg 0x{1:X4}' -f $map, $egg)
        }
        '3' {
            Set-FirstMissionStartConfig -Map ([int]$primarySite.DefaultMap) -Egg ([int]$primarySite.DefaultEgg) -Label 'Restore retail default startup selector'
        }
        'map-default' {
            Set-FirstMissionStartConfig -Map ([int]$primarySite.DefaultMap) -Egg ([int]$primarySite.DefaultEgg) -Label 'Restore retail default startup selector'
        }
        '4' {
            Set-EditorVisibilityEnabled -Enabled $true -Label 'Force editor-object rendering visible'
        }
        'editor-visible' {
            Set-EditorVisibilityEnabled -Enabled $true -Label 'Force editor-object rendering visible'
        }
        '5' {
            Set-EditorVisibilityEnabled -Enabled $false -Label 'Restore retail editor-object hide'
        }
        'editor-default' {
            Set-EditorVisibilityEnabled -Enabled $false -Label 'Restore retail editor-object hide'
        }
        '6' {
            if ($debuggerSites.Count -gt 0) {
                Set-DebuggerEnabled -Enabled $true -Label 'Enable No Regret loosecannon debugger'
            }
            elseif ($flictestBrowserSites.Count -gt 0) {
                Set-FlictestBrowserEnabled -Enabled $true -Label 'Enable Remorse datalink movie browser'
            }
            else {
                Invoke-SoftStartupEditor
            }
        }
        'debugger-enable' {
            Set-DebuggerEnabled -Enabled $true -Label 'Enable No Regret loosecannon debugger'
        }
        'flictest-enable' {
            Set-FlictestBrowserEnabled -Enabled $true -Label 'Enable Remorse datalink movie browser'
        }
        '7' {
            if ($debuggerSites.Count -gt 0) {
                Set-DebuggerEnabled -Enabled $false -Label 'Restore retail No Regret loosecannon behavior'
            }
            elseif ($flictestBrowserSites.Count -gt 0) {
                Set-FlictestBrowserEnabled -Enabled $false -Label 'Restore retail Remorse datalink use'
            }
            else {
                Show-Documentation
            }
        }
        'debugger-default' {
            Set-DebuggerEnabled -Enabled $false -Label 'Restore retail No Regret loosecannon behavior'
        }
        'flictest-default' {
            Set-FlictestBrowserEnabled -Enabled $false -Label 'Restore retail Remorse datalink use'
        }
        '8' {
            if ($debuggerSites.Count -gt 0 -or $flictestBrowserSites.Count -gt 0) {
                Invoke-SoftStartupEditor
            }
            else {
                return $false
            }
        }
        'soft-startup' {
            Invoke-SoftStartupEditor
        }
        'documentation' {
            Show-Documentation
        }
        '9' {
            if ($debuggerSites.Count -gt 0 -or $flictestBrowserSites.Count -gt 0) {
                Show-Documentation
                return $true
            }
            Write-Warning 'Invalid selection.'
        }
        '10' {
            if ($debuggerSites.Count -gt 0 -or $flictestBrowserSites.Count -gt 0) {
                return $false
            }
            Write-Warning 'Invalid selection.'
        }
        'exit' {
            return $false
        }
        default {
            Write-Warning 'Invalid selection.'
        }
    }

    return $true
}

if ($PSBoundParameters.ContainsKey('Choice')) {
    [void](Invoke-MenuChoice -SelectedChoice $Choice)
    return
}

:mainloop while ($true) {
    $currentBytes = [System.IO.File]::ReadAllBytes($exePath)
    Show-Status -FileBytes $currentBytes
    $choicePrompt = if ($debuggerSites.Count -gt 0 -or $flictestBrowserSites.Count -gt 0) { 'Select 1-10' } else { 'Select 1-8' }
    $choice = Read-Host $choicePrompt
    if ([string]::IsNullOrWhiteSpace($choice)) {
        break mainloop
    }

    if (-not (Invoke-MenuChoice -SelectedChoice $choice)) {
        break mainloop
    }
}
