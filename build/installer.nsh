!include "LogicLib.nsh"

!macro customInstall
  nsDialogs::SelectFolderDialog "选择桌宠数据保存位置" "$APPDATA\XHR-cpu23\DeskPetStudio\data"
  Pop $0
  ${If} $0 == error
    StrCpy $0 "$APPDATA\XHR-cpu23\DeskPetStudio\data"
  ${EndIf}

  CreateDirectory "$APPDATA\XHR-cpu23\DeskPetStudio"
  FileOpen $1 "$APPDATA\XHR-cpu23\DeskPetStudio\data-path.txt" w
  FileWriteUTF16LE $1 "$0"
  FileClose $1
  CreateDirectory "$0"
!macroend
