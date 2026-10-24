// window-shake.exe — sacode a janela que está na frente (o jogo, o navegador...) por menos de 1 s.
//
// É o "chamar atenção" do Concord tremendo AO VIVO: mexe a posição da janela de verdade, então o jogo
// continua rodando enquanto treme (nada de foto congelada). Funciona com janelas normais, maximizadas e
// jogos em "tela cheia em janela"/sem borda. Não mexe em nada dentro do programa: só muda a posição
// da janela, como arrastar com o mouse, e devolve ao lugar.
//
// Uso: window-shake [--ms <duração, 200-1500>]
//      window-shake --fullscreen   só consulta: sai com 1 se tem programa em tela cheia na frente, 0 se não
//                                  (o app usa para não piscar a barra de tarefas por cima do jogo)
//
// Janela que cobre o monitor inteiro (jogo em tela cheia em janela): o Windows esconde a barra de tarefas
// só enquanto ela cobre a tela exatamente; tirando do lugar, a barra pularia na frente. Por isso, durante a
// tremida ela fica "sempre por cima" (reafirmado a cada quadro) e volta ao normal no fim.
//
// Código de saída da tremida:
//   0  tremeu
//   3  não tem janela de programa na frente (área de trabalho, barra de tarefas, janela minimizada)
//   4  o Windows não deixou mover (ex.: programa rodando como administrador)
//   5  jogo em tela cheia exclusiva: mover a janela não aparece e pode atrapalhar, então não mexe

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <dwmapi.h>
#include <shellapi.h>

#include <cmath>
#include <cwchar>

#pragma comment(lib, "user32.lib")
#pragma comment(lib, "shell32.lib")
#pragma comment(lib, "dwmapi.lib")

// O movimento: duas ondas (uma na horizontal, outra na vertical, em ritmos diferentes para não parecer
// mecânico) que começam fortes e vão morrendo até parar no lugar. Calculado a cada quadro do monitor.
static const double PI = 3.14159265358979;
static const double AMPLITUDE_PX = 16;
static const double FREQ_X_HZ = 17;
static const double FREQ_Y_HZ = 23;

static bool isShellWindow(HWND hwnd) {
  wchar_t cls[64] = {};
  GetClassNameW(hwnd, cls, 64);
  return !wcscmp(cls, L"Progman") || !wcscmp(cls, L"WorkerW") || !wcscmp(cls, L"Shell_TrayWnd") || !wcscmp(cls, L"Shell_SecondaryTrayWnd");
}

/** A janela cobre o monitor onde está, inteiro (tela cheia em janela, sem borda, ou exclusiva)? */
static bool coversMonitor(HWND hwnd, const RECT& r) {
  MONITORINFO mi = {sizeof(mi)};
  if (!GetMonitorInfoW(MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST), &mi)) return false;
  return r.left <= mi.rcMonitor.left && r.top <= mi.rcMonitor.top && r.right >= mi.rcMonitor.right && r.bottom >= mi.rcMonitor.bottom;
}

static bool fullscreenInFront() {
  QUERY_USER_NOTIFICATION_STATE state;
  if (SUCCEEDED(SHQueryUserNotificationState(&state)) && (state == QUNS_RUNNING_D3D_FULL_SCREEN || state == QUNS_BUSY || state == QUNS_PRESENTATION_MODE)) return true;
  HWND hwnd = GetForegroundWindow();
  RECT r;
  return hwnd && !isShellWindow(hwnd) && GetWindowRect(hwnd, &r) && coversMonitor(hwnd, r);
}

int wmain(int argc, wchar_t** argv) {
  int totalMs = 750;
  bool query = false;
  for (int i = 1; i < argc; i++) {
    if (!wcscmp(argv[i], L"--fullscreen")) query = true;
    else if (!wcscmp(argv[i], L"--ms") && i + 1 < argc) totalMs = _wtoi(argv[++i]);
  }
  if (totalMs < 200) totalMs = 200;
  if (totalMs > 1500) totalMs = 1500;

  // coordenadas em pixels reais: sem isso, em tela com zoom (125%, 150%) a janela voltaria para o lugar errado
  SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
  if (query) return fullscreenInFront() ? 1 : 0;

  QUERY_USER_NOTIFICATION_STATE state;
  if (SUCCEEDED(SHQueryUserNotificationState(&state)) && state == QUNS_RUNNING_D3D_FULL_SCREEN) return 5;

  HWND hwnd = GetForegroundWindow();
  if (!hwnd || isShellWindow(hwnd) || IsIconic(hwnd) || !IsWindowVisible(hwnd)) return 3;

  RECT r;
  if (!GetWindowRect(hwnd, &r)) return 3;
  // ASYNC: se o programa estiver travado, não ficamos presos esperando ele
  UINT flags = SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOOWNERZORDER | SWP_ASYNCWINDOWPOS;
  // tela cheia: fica por cima da barra de tarefas enquanto treme (se já era "sempre por cima", não mexe nisso)
  const bool wasTopmost = (GetWindowLongW(hwnd, GWL_EXSTYLE) & WS_EX_TOPMOST) != 0;
  const bool keepOnTop = coversMonitor(hwnd, r) && !wasTopmost;
  if (!keepOnTop) flags |= SWP_NOZORDER;
  const HWND above = keepOnTop ? HWND_TOPMOST : nullptr;

  LARGE_INTEGER freq, start, now;
  QueryPerformanceFrequency(&freq);
  QueryPerformanceCounter(&start);
  const double total = totalMs / 1000.0;
  bool first = true;

  for (;;) {
    QueryPerformanceCounter(&now);
    const double t = double(now.QuadPart - start.QuadPart) / double(freq.QuadPart);
    if (t >= total) break;
    const double left = 1.0 - t / total;
    const double amp = AMPLITUDE_PX * left * left;  // morre suave no fim
    const int dx = int(std::lround(amp * std::sin(2 * PI * FREQ_X_HZ * t)));
    const int dy = int(std::lround(amp * 0.6 * std::sin(2 * PI * FREQ_Y_HZ * t + 1.3)));
    if (!SetWindowPos(hwnd, above, r.left + dx, r.top + dy, 0, 0, flags)) {
      if (first) return 4;
      break;
    }
    first = false;
    // espera o próximo quadro da tela (60, 144 Hz...): um movimento por quadro, sem pular nem repetir
    if (FAILED(DwmFlush())) Sleep(7);
  }
  // sempre devolve exatamente para onde estava (e tira o "sempre por cima" que a tremida pôs)
  SetWindowPos(hwnd, keepOnTop ? HWND_NOTOPMOST : nullptr, r.left, r.top, 0, 0, flags);
  return 0;
}
