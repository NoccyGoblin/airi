/**
 * FAIRY: reads the text in a picture with the OCR that Windows has built in. It runs on the PC, costs nothing, and
 * reads a full screen in about a quarter second. It recognizes the languages of the Windows user profile.
 */

/** A PowerShell script that prints the text lines of the picture at `path`, one line each. */
export function ocrScript(path: string) {
  return `
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Wait-FairyOp($op, [Type]$type) { $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $task.Wait(); $task.Result }
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType = WindowsRuntime]
$file = Wait-FairyOp ([Windows.Storage.StorageFile]::GetFileFromPathAsync('${path.replaceAll('\'', '\'\'')}')) ([Windows.Storage.StorageFile])
$stream = Wait-FairyOp ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
try {
  $decoder = Wait-FairyOp ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap = Wait-FairyOp ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
  $result = Wait-FairyOp ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
  ($result.Lines | ForEach-Object { $_.Text }) -join [Environment]::NewLine
}
finally { $stream.Dispose() }
`
}
