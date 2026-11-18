param([Parameter(Mandatory=$true)][int]$AnchorPid)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$PSModuleAutoLoadingPreference = 'None'
Import-Module ($PSHOME+'\Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1') -ErrorAction Stop
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Threading;
public static class HanaMeshOwnedJob {
  [StructLayout(LayoutKind.Sequential)] struct BasicLimits {
    public long ProcessTime, JobTime;
    public uint Flags;
    public UIntPtr MinimumWorkingSet, MaximumWorkingSet;
    public uint ActiveLimit;
    public UIntPtr Affinity;
    public uint PriorityClass, SchedulingClass;
  }
  [StructLayout(LayoutKind.Sequential)] struct IoCounters {
    public ulong ReadOperations, WriteOperations, OtherOperations, ReadBytes, WriteBytes, OtherBytes;
  }
  [StructLayout(LayoutKind.Sequential)] struct ExtendedLimits {
    public BasicLimits Basic;
    public IoCounters Io;
    public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
  }
  [StructLayout(LayoutKind.Sequential)] struct Accounting {
    public long UserTime, KernelTime, PeriodUserTime, PeriodKernelTime;
    public uint PageFaults, TotalProcesses, ActiveProcesses, TerminatedProcesses;
  }
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr attributes, string name);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job, int infoClass, ref ExtendedLimits info, uint length);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr job, int infoClass, out Accounting info, uint length, IntPtr returnedLength);
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateJobObject(IntPtr job, uint exitCode);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  static Exception Failure(string operation) { return new InvalidOperationException(operation+":"+Marshal.GetLastWin32Error()); }
  static uint Active(IntPtr job) {
    Accounting info;
    if(!QueryInformationJobObject(job, 1, out info, (uint)Marshal.SizeOf(typeof(Accounting)), IntPtr.Zero)) throw Failure("query-job");
    return info.ActiveProcesses;
  }
  public static void Run(int pid) {
    IntPtr job=CreateJobObject(IntPtr.Zero,null), process=IntPtr.Zero;
    if(job==IntPtr.Zero) throw Failure("create-job");
    try {
      ExtendedLimits limits=new ExtendedLimits(); limits.Basic.Flags=0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
      if(!SetInformationJobObject(job,9,ref limits,(uint)Marshal.SizeOf(typeof(ExtendedLimits)))) throw Failure("limit-job");
      process=OpenProcess(0x0101,false,pid); // PROCESS_SET_QUOTA | PROCESS_TERMINATE
      if(process==IntPtr.Zero) throw Failure("open-anchor");
      if(!AssignProcessToJobObject(job,process)) throw Failure("assign-anchor");
      CloseHandle(process); process=IntPtr.Zero;
      Console.WriteLine("READY"); Console.Out.Flush();
      string line;
      while((line=Console.ReadLine())!=null) {
        if(line=="ACTIVE") { Console.WriteLine("ACTIVE "+Active(job)); Console.Out.Flush(); }
        else if(line=="STOP") {
          if(!TerminateJobObject(job,1)) throw Failure("terminate-job");
          DateTime deadline=DateTime.UtcNow.AddSeconds(1);
          while(Active(job)!=0) {
            if(DateTime.UtcNow>=deadline) throw new InvalidOperationException("job-not-empty");
            Thread.Sleep(5);
          }
          Console.WriteLine("STOPPED"); Console.Out.Flush(); return;
        } else throw new InvalidOperationException("invalid-job-control");
      }
    } finally {
      if(process!=IntPtr.Zero) CloseHandle(process);
      CloseHandle(job); // EOF or any helper failure kills the entire assigned tree.
    }
  }
}
'@
[HanaMeshOwnedJob]::Run($AnchorPid)
