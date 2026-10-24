// window-shake.exe — sacode a janela que está na frente (o jogo, o navegador...) por menos de 1 s.
//
// É o "chamar atenção" do Concord tremendo AO VIVO: mexe a posição da janela de verdade, então o jogo
// continua rodando enquanto treme (nada de foto congelada). Funciona com janelas normais, maximizadas e
// jogos em "tela cheia em janela"/sem borda. Não mexe em nada dentro do programa: só muda a posição
// da janela, como arrastar com o mouse, e devolve ao lugar.
//
// Uso: window-shake [--ms <duração, 200-1500>]
//
// Código de saída:
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

int wmain(int argc, wchar_t** argv) {
  int totalMs = 750;
  for (int i = 1; i + 1 < argc; i++) {
    if (!wcscmp(argv[i], L"--ms")) totalMs = _wtoi(argv[i + 1]);
  }
  if (totalMs < 200) totalMs = 200;
  if (totalMs > 1500) totalMs = 1500;

  // coordenadas em pixels reais: sem isso, em tela com zoom (125%, 150%) a janela voltaria para o lugar errado
  SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);

  QUERY_USER_NOTIFICATION_STATE state;
  if (SUCCEEDED(SHQueryUserNotificationState(&state)) && state == QUNS_RUNNING_D3D_FULL_SCREEN) return 5;

  HWND hwnd = GetForegroundWindow();
  if (!hwnd || isShellWindow(hwnd) || IsIconic(hwnd) || !IsWindowVisible(hwnd)) return 3;

  RECT r;
  if (!GetWindowRect(hwnd, &r)) return 3;
  // ASYNC: se o programa estiver travado, não ficamos presos esperando ele
  const UINT flags = SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_NOOWNERZORDER | SWP_ASYNCWINDOWPOS;

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
    if (!SetWindowPos(hwnd, nullptr, r.left + dx, r.top + dy, 0, 0, flags)) {
      if (first) return 4;
      break;
    }
    first = false;
    // espera o próximo quadro da tela (60, 144 Hz...): um movimento por quadro, sem pular nem repetir
    if (FAILED(DwmFlush())) Sleep(7);
  }
  // sempre devolve exatamente para onde estava
  SetWindowPos(hwnd, nullptr, r.left, r.top, 0, 0, flags);
  return 0;
}
