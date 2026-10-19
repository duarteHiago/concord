; Depois de instalar/atualizar, avisa o Windows para recarregar os ícones. Sem isso, atalhos do menu
; Iniciar, da área de trabalho e da barra de tarefas continuam com o ícone antigo do cache.
!macro customInstall
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
