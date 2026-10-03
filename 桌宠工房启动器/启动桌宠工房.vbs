Option Explicit

Dim shell, fso, scriptPath, projectPath, electronPath, message
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptPath = fso.GetParentFolderName(WScript.ScriptFullName)
If WScript.Arguments.Count > 0 Then
  projectPath = WScript.Arguments(0)
Else
  projectPath = fso.GetParentFolderName(scriptPath)
End If
electronPath = projectPath & "\node_modules\electron\dist\electron.exe"

If Not fso.FileExists(electronPath) Then
  message = "Electron executable was not found." & vbCrLf & vbCrLf & _
    "Run npm.cmd install in the project folder first." & vbCrLf & _
    "Missing file: " & electronPath
  MsgBox message, 16, "Desk Pet Studio"
  WScript.Quit 1
End If

shell.CurrentDirectory = projectPath
shell.Run """" & electronPath & """ .", 0, False
