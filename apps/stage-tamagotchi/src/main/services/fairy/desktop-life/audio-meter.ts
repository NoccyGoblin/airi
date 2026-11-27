/**
 * FAIRY: how loud each app plays right now, from the audio sessions of Windows. Only a peak level per app, never the
 * sound itself. The C# part reads the Core Audio COM interfaces.
 */

const METER_CODE = `
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
namespace FairyAudio {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorCom {}
  [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator { int EnumAudioEndpoints(int a, int b, out IntPtr c); [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint); }
  [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice { [PreserveSig] int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object iface); }
  [Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionManager2 { int GetAudioSessionControl(IntPtr a, int b, out IntPtr c); int GetSimpleAudioVolume(IntPtr a, int b, out IntPtr c); [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator sessions); }
  [Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionEnumerator { [PreserveSig] int GetCount(out int count); [PreserveSig] int GetSession(int index, [MarshalAs(UnmanagedType.IUnknown)] out object session); }
  [Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionControl2 {
    int GetState(out int s); int GetDisplayName(out IntPtr n); int SetDisplayName(IntPtr a, IntPtr b); int GetIconPath(out IntPtr p); int SetIconPath(IntPtr a, IntPtr b);
    int GetGroupingParam(out Guid g); int SetGroupingParam(IntPtr a, IntPtr b); int RegisterAudioSessionNotification(IntPtr a); int UnregisterAudioSessionNotification(IntPtr a);
    int GetSessionIdentifier(out IntPtr s); int GetSessionInstanceIdentifier(out IntPtr s); [PreserveSig] int GetProcessId(out uint pid);
  }
  [Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioMeterInformation { [PreserveSig] int GetPeakValue(out float peak); }
  public static class Meter {
    static IAudioSessionManager2 manager;
    public static string Peaks() {
      if (manager == null) {
        var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorCom());
        IMMDevice device; enumerator.GetDefaultAudioEndpoint(0, 1, out device);
        var iid = typeof(IAudioSessionManager2).GUID; object found;
        device.Activate(ref iid, 23, IntPtr.Zero, out found);
        manager = (IAudioSessionManager2)found;
      }
      IAudioSessionEnumerator sessions; manager.GetSessionEnumerator(out sessions);
      int count; sessions.GetCount(out count);
      var parts = new List<string>();
      for (int i = 0; i < count; i++) {
        object session; sessions.GetSession(i, out session);
        uint pid; ((IAudioSessionControl2)session).GetProcessId(out pid);
        float peak; ((IAudioMeterInformation)session).GetPeakValue(out peak);
        if (pid == 0 || peak <= 0.001f) continue;
        string name; try { name = System.Diagnostics.Process.GetProcessById((int)pid).ProcessName; } catch { continue; }
        parts.Add(name + "|" + pid + "|" + peak.ToString("0.000", System.Globalization.CultureInfo.InvariantCulture));
      }
      return string.Join(";", parts);
    }
  }
}
`

/** A PowerShell script that prints "name|pid|peak" for each app that plays sound now, separated by semicolons. */
export const METER_SCRIPT = `
if (-not ('FairyAudio.Meter' -as [type])) { Add-Type -TypeDefinition @'
${METER_CODE}
'@ }
[FairyAudio.Meter]::Peaks()
`

export interface AppLevel {
  name: string
  pid: number
  peak: number
}

export function parsePeaks(output: string): AppLevel[] {
  return output.trim().split(';').filter(Boolean).map((part) => {
    const [name, pid, peak] = part.split('|')
    return { name, pid: Number(pid), peak: Number(peak) }
  }).filter(level => level.name && Number.isFinite(level.pid) && Number.isFinite(level.peak))
}

/** Apps that play music or videos. Calls, games, and AIRI itself do not count, so she does not dance to them. */
const MEDIA_APPS = new Set(['spotify', 'firefox', 'chrome', 'msedge', 'brave', 'opera', 'opera_gx', 'vivaldi', 'vlc', 'foobar2000', 'musicbee', 'aimp', 'itunes', 'applemusic', 'deezer', 'tidal', 'microsoft.media.player', 'wmplayer', 'mpc-hc64', 'mpc-be64', 'potplayermini64'])

/** The loudest level of the media apps, without the processes in `ignore`. */
export function mediaLevel(levels: readonly AppLevel[], ignore: ReadonlySet<number>) {
  return levels
    .filter(level => !ignore.has(level.pid) && MEDIA_APPS.has(level.name.toLowerCase()))
    .reduce((loudest, level) => Math.max(loudest, level.peak), 0)
}
