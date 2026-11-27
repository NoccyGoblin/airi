' Starts the fairy companion without a console window. The Lumi shortcuts in the Start menu and on the desktop run
' this file. To stop her, right-click her and choose Quit AIRI.
'
' What the console window showed goes to fairy-data\logs\companion.log, so a problem can be read afterwards.
' A second start does nothing: the dev server of the first one holds port 5173, and a second one on another port
' would open with empty storage.

Option Explicit

Dim shell, fso, root, logs, q, running
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
q = Chr(34)

root = fso.GetParentFolderName(WScript.ScriptFullName)
logs = root & "\fairy-data\logs"

running = shell.Run("cmd /c netstat -ano | findstr " & q & ":5173 " & q & " | findstr LISTENING", 0, True)
If running = 0 Then
  shell.Popup "Lumi is already running.", 3, "Lumi", 64
  WScript.Quit
End If

If Not fso.FolderExists(root & "\fairy-data") Then fso.CreateFolder root & "\fairy-data"
If Not fso.FolderExists(logs) Then fso.CreateFolder logs

shell.CurrentDirectory = root
' The developer build opens DevTools next to her by default. Daily use does not need it.
shell.Environment("Process")("APP_DEBUG") = "0"
shell.Run "cmd /c " & q & q & root & "\start-fairy.cmd" & q & " > " & q & logs & "\companion.log" & q & " 2>&1" & q, 0, False
