' Starts the Game7 server with no console window and lets serve.mjs open the
' browser. Window style 0 = hidden, False = don't wait for it to exit.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = here
sh.Run "node """ & here & "\serve.mjs""", 0, False
