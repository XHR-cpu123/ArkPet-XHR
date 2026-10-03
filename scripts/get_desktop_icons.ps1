$source = @'
using System;
using System.Text;
using System.Runtime.InteropServices;

public class DesktopIcons {
  public delegate bool EnumProc(IntPtr hwnd, IntPtr lParam);

  [StructLayout(LayoutKind.Sequential)]
  public struct POINT {
    public int X;
    public int Y;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct LVITEM {
    public uint mask;
    public int iItem;
    public int iSubItem;
    public uint state;
    public uint stateMask;
    public IntPtr pszText;
    public int cchTextMax;
    public int iImage;
    public IntPtr lParam;
    public int iIndent;
    public int iGroupId;
    public uint cColumns;
    public IntPtr puColumns;
    public IntPtr piColFmt;
    public int iGroup;
  }

  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumProc callback, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern bool EnumChildWindows(
    IntPtr parent,
    EnumProc callback,
    IntPtr lParam
  );

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetClassName(IntPtr hwnd, StringBuilder value, int size);

  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);

  [DllImport("kernel32.dll")]
  public static extern IntPtr OpenProcess(uint access, bool inherit, uint processId);

  [DllImport("kernel32.dll")]
  public static extern IntPtr VirtualAllocEx(
    IntPtr process,
    IntPtr address,
    uint size,
    uint allocationType,
    uint protect
  );

  [DllImport("kernel32.dll")]
  public static extern bool VirtualFreeEx(
    IntPtr process,
    IntPtr address,
    uint size,
    uint freeType
  );

  [DllImport("kernel32.dll")]
  public static extern bool ReadProcessMemory(
    IntPtr process,
    IntPtr address,
    byte[] buffer,
    uint size,
    out IntPtr read
  );

  [DllImport("kernel32.dll")]
  public static extern bool WriteProcessMemory(
    IntPtr process,
    IntPtr address,
    byte[] buffer,
    uint size,
    out IntPtr written
  );

  [DllImport("kernel32.dll")]
  public static extern bool CloseHandle(IntPtr handle);

  [DllImport("user32.dll")]
  public static extern IntPtr SendMessage(
    IntPtr hwnd,
    uint message,
    IntPtr wParam,
    IntPtr lParam
  );

  [DllImport("user32.dll")]
  public static extern bool ClientToScreen(IntPtr hwnd, ref POINT point);

  static string ClassName(IntPtr hwnd) {
    var value = new StringBuilder(256);
    GetClassName(hwnd, value, value.Capacity);
    return value.ToString();
  }

  public static IntPtr DefView;
  public static IntPtr ListView;

  static bool FindListViewUnder(IntPtr parent) {
    var found = IntPtr.Zero;
    EnumChildWindows(parent, (child, _) => {
      if (ClassName(child) == "SysListView32") {
        found = child;
        return false;
      }
      return true;
    }, IntPtr.Zero);
    if (found == IntPtr.Zero) return false;
    DefView = parent;
    ListView = found;
    return true;
  }

  public static bool Find() {
    DefView = IntPtr.Zero;
    ListView = IntPtr.Zero;
    EnumWindows((hwnd, _) => {
      if (
        ClassName(hwnd) == "SHELLDLL_DefView" &&
        FindListViewUnder(hwnd)
      ) {
        return false;
      }
      EnumChildWindows(hwnd, (child, __) => {
        if (
          ClassName(child) == "SHELLDLL_DefView" &&
          FindListViewUnder(child)
        ) {
          return false;
        }
        return true;
      }, IntPtr.Zero);
      return ListView == IntPtr.Zero;
    }, IntPtr.Zero);
    return ListView != IntPtr.Zero;
  }

  public static string Dump() {
    uint processId;
    GetWindowThreadProcessId(ListView, out processId);
    var process = OpenProcess(0x0438, false, processId);
    if (process == IntPtr.Zero) return "[]";
    var remote = VirtualAllocEx(
      process,
      IntPtr.Zero,
      4096,
      0x3000,
      0x04
    );
    if (remote == IntPtr.Zero) {
      CloseHandle(process);
      return "[]";
    }

    var count = (int)SendMessage(ListView, 0x1004, IntPtr.Zero, IntPtr.Zero);
    var origin = new POINT();
    ClientToScreen(ListView, ref origin);
    var pointRemote = IntPtr.Add(remote, 1024);
    var rectRemote = IntPtr.Add(remote, 1040);
    var textRemote = IntPtr.Add(remote, 1088);
    var itemSize = Marshal.SizeOf(typeof(LVITEM));
    var result = new StringBuilder();
    result.Append("[");
    string prefix = "";
    for (var index = 0; index < count; index++) {
      SendMessage(ListView, 0x1010, (IntPtr)index, pointRemote);
      var pointBuffer = new byte[8];
      IntPtr bytesRead;
      ReadProcessMemory(process, pointRemote, pointBuffer, 8, out bytesRead);
      var x = BitConverter.ToInt32(pointBuffer, 0);
      var y = BitConverter.ToInt32(pointBuffer, 4);

      var rectBuffer = new byte[16];
      SendMessage(ListView, 0x100E, (IntPtr)index, rectRemote);
      ReadProcessMemory(process, rectRemote, rectBuffer, 16, out bytesRead);
      var left = BitConverter.ToInt32(rectBuffer, 0);
      var top = BitConverter.ToInt32(rectBuffer, 4);
      var right = BitConverter.ToInt32(rectBuffer, 8);
      var bottom = BitConverter.ToInt32(rectBuffer, 12);
      var width = Math.Max(32, right - left);
      var height = Math.Max(32, bottom - top);

      var item = new LVITEM {
        mask = 1,
        iItem = index,
        iSubItem = 0,
        pszText = textRemote,
        cchTextMax = 260
      };
      var itemBuffer = new byte[itemSize];
      var itemHandle = Marshal.AllocHGlobal(itemSize);
      try {
        Marshal.StructureToPtr(item, itemHandle, false);
        Marshal.Copy(itemHandle, itemBuffer, 0, itemSize);
      } finally {
        Marshal.FreeHGlobal(itemHandle);
      }
      IntPtr written;
      WriteProcessMemory(
        process,
        remote,
        itemBuffer,
        (uint)itemSize,
        out written
      );
      var textLength = (int)SendMessage(
        ListView,
        0x1073,
        (IntPtr)index,
        remote
      );
      var textBuffer = new byte[520];
      ReadProcessMemory(
        process,
        textRemote,
        textBuffer,
        520,
        out bytesRead
      );
      var safeTextLength = Math.Max(
        0,
        Math.Min(textLength * 2, textBuffer.Length)
      );
      var label = Encoding.Unicode
        .GetString(textBuffer, 0, safeTextLength)
        .TrimEnd('\0');

      result.Append(prefix);
      prefix = ",";
      result.Append("{\"x\":");
      result.Append(origin.X + x);
      result.Append(",\"y\":");
      result.Append(origin.Y + y);
      result.Append(",\"width\":");
      result.Append(width);
      result.Append(",\"height\":");
      result.Append(height);
      result.Append(",\"label\":\"");
      result.Append(Convert.ToBase64String(Encoding.Unicode.GetBytes(label)));
      result.Append("\"}");
    }
    result.Append("]");
    VirtualFreeEx(process, remote, 0, 0x8000);
    CloseHandle(process);
    return result.ToString();
  }
}
'@

Add-Type -TypeDefinition $source
if (-not [DesktopIcons]::Find()) {
  "[]"
  exit 0
}
[DesktopIcons]::Dump()
