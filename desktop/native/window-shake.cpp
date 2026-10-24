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
#include <shellapi.h>

#include <cwchar>

#pragma comment(lib, "user32.lib")
#pragma comment(lib, "shell32.lib")

static const int OFFSETS[][2] = {{-14, 5}, {12, -7}, {-12, -5}, {14, 7}, {-9, 3}, {9, -5}, {-7, 5}, {5, -3}, {-2, 2}, {0, 0}};
static const int STEPS = sizeof(OFFSETS) / sizeof(OFFSETS[0]);

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
  const UINT flags = SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_NOOWNERZORDER | SWP_ASYNCWINDOWPOS;
  const DWORD stepMs = totalMs / STEPS;

  for (int i = 0; i < STEPS; i++) {
    // ASYNC: se o programa estiver travado, não ficamos presos esperando ele
    if (!SetWindowPos(hwnd, nullptr, r.left + OFFSETS[i][0], r.top + OFFSETS[i][1], 0, 0, flags)) {
      if (i == 0) return 4;
      break;
    }
    Sleep(stepMs);
  }
  // sempre devolve exatamente para onde estava
  SetWindowPos(hwnd, nullptr, r.left, r.top, 0, 0, flags);
  return 0;
}
