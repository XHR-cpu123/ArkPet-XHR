Option Explicit

Dim shell, fso, scriptPath, projectPath, command
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptPath = fso.GetParentFolderName(WScript.ScriptFullName)
projectPath = fso.GetParentFolderName(scriptPath)
shell.CurrentDirectory = projectPath

command = "cmd.exe /d /c npm.cmd start > ""%TEMP%\desk-pet-launch.log"" 2>&1"
shell.Run command, 0, False
