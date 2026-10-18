// audio-capture.exe — captura o áudio do Windows por processo (WASAPI process loopback).
//
// É o mesmo recurso que o Discord usa: dá para capturar todo o som do PC MENOS o do
// próprio Concord (as vozes da sala), então quem assiste não ouve a própria voz de volta.
//
// Uso:
//   audio-capture --exclude <pid>          todo o áudio do PC, exceto a árvore de processos <pid>
//   audio-capture --include <pid>          só o áudio da árvore de processos <pid>
//   audio-capture --include-window <hwnd>  só o áudio do programa dono da janela <hwnd>
//
//   audio-capture --window-titles <programa.exe>  lista os títulos das janelas do programa (UTF-8)
//
// Saída da captura: PCM 16 bits, 48 kHz, estéreo intercalado, em stdout.
// Encerra quando o stdin é fechado (ou seja, quando o app que o iniciou sai).
// Requer Windows 10 build 20348+ ou Windows 11.

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <audioclient.h>
#include <audioclientactivationparams.h>
#include <mmdeviceapi.h>
#include <wrl/client.h>
#include <wrl/implements.h>

#include <fcntl.h>
#include <io.h>

#include <cstdio>
#include <cstdlib>
#include <cwchar>
#include <vector>

#pragma comment(lib, "mmdevapi.lib")
#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "user32.lib")

using Microsoft::WRL::ClassicCom;
using Microsoft::WRL::ComPtr;
using Microsoft::WRL::FtmBase;
using Microsoft::WRL::Make;
using Microsoft::WRL::RuntimeClass;
using Microsoft::WRL::RuntimeClassFlags;

class ActivationHandler
    : public RuntimeClass<RuntimeClassFlags<ClassicCom>, FtmBase, IActivateAudioInterfaceCompletionHandler> {
 public:
  HANDLE done = CreateEventW(nullptr, TRUE, FALSE, nullptr);
  HRESULT result = E_FAIL;
  ComPtr<IAudioClient> client;

  STDMETHOD(ActivateCompleted)(IActivateAudioInterfaceAsyncOperation* operation) override {
    HRESULT activateResult = E_FAIL;
    ComPtr<IUnknown> unknown;
    result = operation->GetActivateResult(&activateResult, &unknown);
    if (SUCCEEDED(result)) result = activateResult;
    if (SUCCEEDED(result)) result = unknown.As(&client);
    SetEvent(done);
    return S_OK;
  }
};

static volatile LONG g_running = 1;

// Quando o processo pai fecha o stdin (ou morre), encerra a captura.
static DWORD WINAPI WatchStdin(LPVOID) {
  char buffer[64];
  DWORD read = 0;
  HANDLE input = GetStdHandle(STD_INPUT_HANDLE);
  while (ReadFile(input, buffer, sizeof(buffer), &read, nullptr) && read > 0) {
  }
  InterlockedExchange(&g_running, 0);
  return 0;
}

static int Fail(const char* step, HRESULT hr) {
  fprintf(stderr, "erro em %s: 0x%08lX\n", step, static_cast<unsigned long>(hr));
  return 1;
}

// ---- Modo auxiliar: títulos das janelas de um programa (inclusive ocultas/na bandeja) ----
// Usado para ler "Artista - Música" do Spotify mesmo quando ele está minimizado na bandeja.

struct TitleSearch {
  const wchar_t* exe;
};

static BOOL CALLBACK CollectTitle(HWND hwnd, LPARAM param) {
  auto* search = reinterpret_cast<TitleSearch*>(param);
  wchar_t title[512];
  if (GetWindowTextW(hwnd, title, 512) <= 0) return TRUE;

  DWORD pid = 0;
  GetWindowThreadProcessId(hwnd, &pid);
  HANDLE proc = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
  if (!proc) return TRUE;
  wchar_t path[MAX_PATH];
  DWORD size = MAX_PATH;
  BOOL ok = QueryFullProcessImageNameW(proc, 0, path, &size);
  CloseHandle(proc);
  if (!ok) return TRUE;

  const wchar_t* name = wcsrchr(path, L'\\');
  name = name ? name + 1 : path;
  if (_wcsicmp(name, search->exe) != 0) return TRUE;

  char utf8[2048];
  int len = WideCharToMultiByte(CP_UTF8, 0, title, -1, utf8, sizeof(utf8), nullptr, nullptr);
  if (len > 1) printf("%s\n", utf8);
  return TRUE;
}

static int ListWindowTitles(const wchar_t* exe) {
  TitleSearch search{exe};
  EnumWindows(CollectTitle, reinterpret_cast<LPARAM>(&search));
  fflush(stdout);
  return 0;
}

int wmain(int argc, wchar_t** argv) {
  if (argc >= 3 && wcscmp(argv[1], L"--window-titles") == 0) return ListWindowTitles(argv[2]);

  if (argc < 3) {
    fprintf(stderr, "uso: audio-capture --exclude <pid> | --include <pid> | --include-window <hwnd>\n");
    return 2;
  }

  bool include = false;
  DWORD pid = 0;
  if (wcscmp(argv[1], L"--exclude") == 0) {
    pid = wcstoul(argv[2], nullptr, 10);
  } else if (wcscmp(argv[1], L"--include") == 0) {
    include = true;
    pid = wcstoul(argv[2], nullptr, 10);
  } else if (wcscmp(argv[1], L"--include-window") == 0) {
    include = true;
    HWND hwnd = reinterpret_cast<HWND>(static_cast<ULONG_PTR>(_wcstoui64(argv[2], nullptr, 10)));
    GetWindowThreadProcessId(hwnd, &pid);
  }
  if (pid == 0) {
    fprintf(stderr, "processo alvo não encontrado\n");
    return 3;
  }

  HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  if (FAILED(hr)) return Fail("CoInitializeEx", hr);

  AUDIOCLIENT_ACTIVATION_PARAMS params = {};
  params.ActivationType = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK;
  params.ProcessLoopbackParams.TargetProcessId = pid;
  params.ProcessLoopbackParams.ProcessLoopbackMode =
      include ? PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE : PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE;

  PROPVARIANT activation = {};
  activation.vt = VT_BLOB;
  activation.blob.cbSize = sizeof(params);
  activation.blob.pBlobData = reinterpret_cast<BYTE*>(&params);

  ComPtr<ActivationHandler> handler = Make<ActivationHandler>();
  ComPtr<IActivateAudioInterfaceAsyncOperation> operation;
  hr = ActivateAudioInterfaceAsync(VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK, __uuidof(IAudioClient), &activation,
                                   handler.Get(), &operation);
  if (FAILED(hr)) return Fail("ActivateAudioInterfaceAsync", hr);
  WaitForSingleObject(handler->done, INFINITE);
  if (FAILED(handler->result)) return Fail("ativação do process loopback", handler->result);
  ComPtr<IAudioClient> client = handler->client;

  WAVEFORMATEX format = {};
  format.wFormatTag = WAVE_FORMAT_PCM;
  format.nChannels = 2;
  format.nSamplesPerSec = 48000;
  format.wBitsPerSample = 16;
  format.nBlockAlign = format.nChannels * format.wBitsPerSample / 8;
  format.nAvgBytesPerSec = format.nSamplesPerSec * format.nBlockAlign;

  hr = client->Initialize(AUDCLNT_SHAREMODE_SHARED,
                          AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK |
                              AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM | AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY,
                          200000 /* 20 ms */, 0, &format, nullptr);
  if (FAILED(hr)) return Fail("IAudioClient::Initialize", hr);

  HANDLE packetReady = CreateEventW(nullptr, FALSE, FALSE, nullptr);
  hr = client->SetEventHandle(packetReady);
  if (FAILED(hr)) return Fail("SetEventHandle", hr);

  ComPtr<IAudioCaptureClient> capture;
  hr = client->GetService(IID_PPV_ARGS(&capture));
  if (FAILED(hr)) return Fail("GetService", hr);

  _setmode(_fileno(stdout), _O_BINARY);
  CreateThread(nullptr, 0, WatchStdin, nullptr, 0, nullptr);

  hr = client->Start();
  if (FAILED(hr)) return Fail("IAudioClient::Start", hr);
  fprintf(stderr, "captura iniciada (pid %lu, modo %s)\n", static_cast<unsigned long>(pid), include ? "include" : "exclude");
  fflush(stderr);

  std::vector<BYTE> silence;
  while (g_running) {
    if (WaitForSingleObject(packetReady, 100) != WAIT_OBJECT_0) continue;
    UINT32 packetFrames = 0;
    while (SUCCEEDED(capture->GetNextPacketSize(&packetFrames)) && packetFrames > 0) {
      BYTE* data = nullptr;
      UINT32 frames = 0;
      DWORD flags = 0;
      if (FAILED(capture->GetBuffer(&data, &frames, &flags, nullptr, nullptr))) break;
      const size_t bytes = static_cast<size_t>(frames) * format.nBlockAlign;
      if (flags & AUDCLNT_BUFFERFLAGS_SILENT) {
        silence.assign(bytes, 0);
        fwrite(silence.data(), 1, bytes, stdout);
      } else {
        fwrite(data, 1, bytes, stdout);
      }
      capture->ReleaseBuffer(frames);
    }
    if (fflush(stdout) != 0) break;  // o app fechou o pipe
  }

  client->Stop();
  CoUninitialize();
  return 0;
}
