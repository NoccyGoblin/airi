/** FAIRY: a screen area in physical pixels, as Windows places the mouse. */
export interface PhysicalRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Maps a point in a screenshot to the physical screen point under it.
 *
 * @example
 * screenPointOf({ x: 800, y: 450 }, { width: 1600, height: 900 }, { x: 0, y: 0, width: 3840, height: 2160 })
 * // => { x: 1920, y: 1080 }
 */
export function screenPointOf(point: { x: number, y: number }, image: { width: number, height: number }, display: PhysicalRect) {
  if (point.x < 0 || point.y < 0 || point.x > image.width || point.y > image.height)
    throw new Error(`The point (${point.x}, ${point.y}) is outside the ${image.width}x${image.height} screenshot.`)
  return {
    x: Math.round(display.x + point.x * display.width / image.width),
    y: Math.round(display.y + point.y * display.height / image.height),
  }
}

const MOUSE_DOWN = { left: 0x02, right: 0x08 } as const
const MOUSE_UP = { left: 0x04, right: 0x10 } as const
const MOUSE_WHEEL = 0x0800
/** One notch of a mouse wheel, as Windows counts it. */
const WHEEL_NOTCH = 120

const MOUSE_TYPE = `
Add-Type -Namespace Fairy -Name Mouse -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
[DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
[DllImport("user32.dll")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
'@
[void][Fairy.Mouse]::SetProcessDPIAware()
`

/** A PowerShell script that clicks at a physical screen point. */
export function clickScript(point: { x: number, y: number }, button: 'left' | 'right', double: boolean) {
  const once = `[Fairy.Mouse]::mouse_event(${MOUSE_DOWN[button]}, 0, 0, 0, 0); [Fairy.Mouse]::mouse_event(${MOUSE_UP[button]}, 0, 0, 0, 0)`
  return [
    MOUSE_TYPE,
    `[void][Fairy.Mouse]::SetCursorPos(${Math.round(point.x)}, ${Math.round(point.y)})`,
    'Start-Sleep -Milliseconds 80',
    once,
    ...(double ? ['Start-Sleep -Milliseconds 90', once] : []),
  ].join('\n')
}

/**
 * A PowerShell script that prints the process id of the top window at a physical screen point. Click-through windows
 * do not count, because a click goes past them.
 */
export function windowAtScript(point: { x: number, y: number }) {
  return `
Add-Type -Namespace Fairy -Name Hit -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
[DllImport("user32.dll")] public static extern System.IntPtr WindowFromPoint(POINT point);
[DllImport("user32.dll")] public static extern System.IntPtr GetAncestor(System.IntPtr hWnd, int flags);
[DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(System.IntPtr hWnd, out int processId);
public struct POINT { public int X; public int Y; }
'@
[void][Fairy.Hit]::SetProcessDPIAware()
$point = New-Object Fairy.Hit+POINT
$point.X = ${Math.round(point.x)}
$point.Y = ${Math.round(point.y)}
$id = 0
[void][Fairy.Hit]::GetWindowThreadProcessId([Fairy.Hit]::GetAncestor([Fairy.Hit]::WindowFromPoint($point), 2), [ref]$id)
$id
`
}

/** A PowerShell script that turns the mouse wheel where the pointer is. Positive notches scroll up. */
export function scrollScript(notches: number) {
  return `${MOUSE_TYPE}\n[Fairy.Mouse]::mouse_event(${MOUSE_WHEEL}, 0, 0, ${Math.round(notches) * WHEEL_NOTCH}, 0)`
}
