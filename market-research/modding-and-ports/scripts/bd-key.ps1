# Reads the Bright Data API key that the Linkgo app stored in Windows
# Credential Manager (Rust keyring 3.x, service "linkgo", user "brightdata")
# and writes ONLY the key to stdout, with no trailing newline.
#
# Run: powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File bd-key.ps1
#
# Exit codes: 0 ok, 2 credential missing, 3 credential malformed.
# Error messages are generic and never contain credential content.

[CmdletBinding()]
param(
  [string]$Service = 'linkgo',
  [string]$User = 'brightdata'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Fail([int]$code, [string]$message) {
  [Console]::Error.WriteLine($message)
  exit $code
}

try {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class LinkgoCredRead {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  private struct CREDENTIAL {
    public UInt32 Flags;
    public UInt32 Type;
    public IntPtr TargetName;
    public IntPtr Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public UInt32 CredentialBlobSize;
    public IntPtr CredentialBlob;
    public UInt32 Persist;
    public UInt32 AttributeCount;
    public IntPtr Attributes;
    public IntPtr TargetAlias;
    public IntPtr UserName;
  }

  [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
  private static extern bool CredRead(string target, UInt32 type, UInt32 flags, out IntPtr credential);

  [DllImport("advapi32.dll", EntryPoint = "CredFree")]
  private static extern void CredFree(IntPtr buffer);

  // CRED_TYPE_GENERIC = 1. Returns null when the credential does not exist.
  public static byte[] Read(string target) {
    IntPtr pointer;
    if (!CredRead(target, 1, 0, out pointer)) return null;
    try {
      CREDENTIAL cred = (CREDENTIAL)Marshal.PtrToStructure(pointer, typeof(CREDENTIAL));
      byte[] blob = new byte[cred.CredentialBlobSize];
      if (cred.CredentialBlobSize > 0) {
        Marshal.Copy(cred.CredentialBlob, blob, 0, (int)cred.CredentialBlobSize);
      }
      return blob;
    } finally {
      CredFree(pointer);
    }
  }
}
'@
} catch {
  Fail 3 'credential reader unavailable'
}

# keyring-rs target naming on Windows: "<user>.<service>".
function TargetFor([string]$user) { return "$user.$Service" }

function TryParseJson([string]$text) {
  try { return ($text | ConvertFrom-Json) } catch { return $null }
}

$utf16 = [System.Text.Encoding]::Unicode
$utf8 = New-Object System.Text.UTF8Encoding($false, $true)

try {
  $primaryBytes = [LinkgoCredRead]::Read((TargetFor $User))
} catch {
  Fail 3 'credential malformed'
}
if ($null -eq $primaryBytes -or $primaryBytes.Length -eq 0) {
  Fail 2 'credential missing'
}

# keyring stores UTF-16LE; fall back to UTF-8 only if that is what parses.
$encoding = $null
$primaryText = $null
$primaryJson = $null
foreach ($candidate in @($utf16, $utf8)) {
  if ($candidate -eq $utf16 -and ($primaryBytes.Length % 2) -ne 0) { continue }
  try { $decoded = $candidate.GetString($primaryBytes) } catch { continue }
  $parsed = TryParseJson $decoded
  if ($null -ne $parsed) {
    $encoding = $candidate
    $primaryText = $decoded
    $primaryJson = $parsed
    break
  }
}
if ($null -eq $primaryJson) { Fail 3 'credential malformed' }

# Chunk marker per src-tauri/src/auth/storage.rs: {"linkgoChunkedV1":n},
# parts under users "<user>#1".."<user>#n", concatenated in order.
$secretText = $primaryText
$markerProp = $primaryJson.PSObject.Properties['linkgoChunkedV1']
if ($null -ne $markerProp) {
  $count = 0
  if (-not [int]::TryParse([string]$markerProp.Value, [ref]$count)) { Fail 3 'credential malformed' }
  if ($count -lt 1 -or $count -gt 64) { Fail 3 'credential malformed' }
  $builder = New-Object System.Text.StringBuilder
  for ($index = 1; $index -le $count; $index++) {
    try { $chunkBytes = [LinkgoCredRead]::Read((TargetFor "$User#$index")) } catch { Fail 3 'credential malformed' }
    if ($null -eq $chunkBytes) { Fail 2 'credential missing' }
    try { [void]$builder.Append($encoding.GetString($chunkBytes)) } catch { Fail 3 'credential malformed' }
  }
  $secretText = $builder.ToString()
}

$credential = TryParseJson $secretText
if ($null -eq $credential) { Fail 3 'credential malformed' }

$kind = $credential.PSObject.Properties['kind']
$provider = $credential.PSObject.Properties['providerKey']
$apiKey = $credential.PSObject.Properties['apiKey']
if ($null -eq $kind -or $kind.Value -ne 'api_key') { Fail 3 'credential malformed' }
if ($null -eq $provider -or $provider.Value -ne 'brightdata') { Fail 3 'credential malformed' }
if ($null -eq $apiKey -or -not ($apiKey.Value -is [string]) -or [string]::IsNullOrWhiteSpace($apiKey.Value)) {
  Fail 3 'credential malformed'
}

[Console]::Out.Write([string]$apiKey.Value)
exit 0
