# HWP 5.0 (OLE) 본문을 한글 프로그램 없이 읽어 문단·표 구조를 텍스트로 출력 (양식 칸 파악용)
param([string[]]$Paths)
Add-Type -Language CSharp -TypeDefinition @'
using System; using System.IO; using System.IO.Compression; using System.Text; using System.Collections.Generic;
using System.Runtime.InteropServices; using System.Runtime.InteropServices.ComTypes;
public static class HwpDump {
  [ComImport, Guid("0000000b-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IStorage {
    void CreateStream();
    [PreserveSig] int OpenStream([MarshalAs(UnmanagedType.LPWStr)] string name, IntPtr r1, uint mode, uint r2, out IStream stm);
    void CreateStorage();
    [PreserveSig] int OpenStorage([MarshalAs(UnmanagedType.LPWStr)] string name, IntPtr prio, uint mode, IntPtr snb, uint r, out IStorage stg);
  }
  [DllImport("ole32.dll")] static extern int StgOpenStorage([MarshalAs(UnmanagedType.LPWStr)] string name, IntPtr prio, uint mode, IntPtr snb, uint r, out IStorage stg);
  const uint EXCL = 0x10;
  static byte[] ReadAll(IStream s) {
    var ms = new MemoryStream(); var buf = new byte[65536]; IntPtr pcb = Marshal.AllocHGlobal(4);
    try { while (true) { s.Read(buf, buf.Length, pcb); int n = Marshal.ReadInt32(pcb); if (n <= 0) break; ms.Write(buf, 0, n); } }
    finally { Marshal.FreeHGlobal(pcb); }
    return ms.ToArray();
  }
  static byte[] Inflate(byte[] d) { using (var z = new DeflateStream(new MemoryStream(d), CompressionMode.Decompress)) { var o = new MemoryStream(); z.CopyTo(o); return o.ToArray(); } }
  static string Text(byte[] b) {
    var sb = new StringBuilder(); int i = 0;
    while (i + 1 < b.Length) {
      int c = BitConverter.ToUInt16(b, i);
      if (c < 32) {
        bool single = c == 0 || c == 10 || c == 13 || (c >= 24 && c <= 31);
        if (c == 10) sb.Append(' ');
        if (c == 9) sb.Append(' ');
        i += single ? 2 : 16; continue;
      }
      sb.Append((char)c); i += 2;
    }
    return sb.ToString();
  }
  public static string Dump(string path) {
    IStorage root; int hr = StgOpenStorage(path, IntPtr.Zero, 0x20, IntPtr.Zero, 0, out root);
    if (hr != 0) return "open failed " + hr.ToString("X");
    IStream fh; root.OpenStream("FileHeader", IntPtr.Zero, EXCL, 0, out fh);
    var head = ReadAll(fh); bool compressed = (BitConverter.ToUInt32(head, 36) & 1) != 0;
    IStorage body; root.OpenStorage("BodyText", IntPtr.Zero, EXCL, IntPtr.Zero, 0, out body);
    var outp = new StringBuilder();
    for (int sec = 0; ; sec++) {
      IStream st; if (body.OpenStream("Section" + sec, IntPtr.Zero, EXCL, 0, out st) != 0) break;
      var data = ReadAll(st); if (compressed) data = Inflate(data);
      int p = 0; int tblLevel = -1; string cell = null; var cellText = new StringBuilder(); var rows = new SortedDictionary<int, List<string>>();
      Action flushCell = () => { if (cell != null) { var parts = cell.Split('|'); int r = int.Parse(parts[0]); if (!rows.ContainsKey(r)) rows[r] = new List<string>(); rows[r].Add("{" + parts[1] + "} " + cellText.ToString().Trim()); } cell = null; cellText.Clear(); };
      Action flushTable = () => { flushCell(); foreach (var kv in rows) outp.AppendLine("    " + string.Join(" | ", kv.Value)); rows.Clear(); tblLevel = -1; };
      while (p + 4 <= data.Length) {
        uint h = BitConverter.ToUInt32(data, p); p += 4;
        int tag = (int)(h & 0x3FF), lvl = (int)((h >> 10) & 0x3FF); int size = (int)((h >> 20) & 0xFFF);
        if (size == 0xFFF) { size = (int)BitConverter.ToUInt32(data, p); p += 4; }
        var rec = new byte[size]; Array.Copy(data, p, rec, 0, Math.Min(size, data.Length - p)); p += size;
        if (tblLevel >= 0 && lvl <= tblLevel && tag != 72) flushTable();
        if (tag == 71 && size >= 4 && BitConverter.ToUInt32(rec, 0) == 0x74626C20) { if (tblLevel >= 0) flushTable(); tblLevel = lvl; }
        else if (tag == 77 && tblLevel >= 0) outp.AppendLine("  [TABLE rows=" + BitConverter.ToUInt16(rec, 4) + " cols=" + BitConverter.ToUInt16(rec, 6) + "]");
        else if (tag == 72 && tblLevel >= 0 && size >= 24) {
          flushCell();
          int col = BitConverter.ToUInt16(rec, 8), row = BitConverter.ToUInt16(rec, 10), cs = BitConverter.ToUInt16(rec, 12), rs = BitConverter.ToUInt16(rec, 14);
          int w = (int)(BitConverter.ToUInt32(rec, 16) / 100);
          cell = row + "|" + row + "," + col + " s" + rs + "x" + cs + " w" + w;
        }
        else if (tag == 67) { var t = Text(rec); if (cell != null) cellText.Append(t).Append(' '); else if (t.Trim().Length > 0) outp.AppendLine("P: " + t); }
      }
      if (tblLevel >= 0) flushTable();
    }
    return outp.ToString();
  }
}
'@
foreach ($p in $Paths) { "===== " + [IO.Path]::GetFileName($p); [HwpDump]::Dump($p) }
