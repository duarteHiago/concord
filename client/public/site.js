// Botões de download do site (landing e páginas de texto): Windows baixa o .exe, macOS o .dmg e no celular
// vira "Instalar", que leva ao passo a passo de instalar pelo navegador.
//   data-dl="nav"   botão da topbar ("Baixar"; no celular "Instalar")
//   data-dl="main"  botão principal ("Baixar para Windows" / "Baixar para macOS" / "Instalar no celular")
//   data-dl="alt"   link discreto para o outro sistema de computador (some no celular)
//   data-mobile-text / data-mobile-href trocam o destino no celular; [data-desktop-only] some no celular.
(() => {
  const WIN = '/downloads/Concord-Setup.exe';
  const MAC = '/downloads/Concord.dmg';
  const ua = navigator.userAgent;
  // o iPad com iPadOS se apresenta como Mac; quem entrega é a tela de toque
  const ipad = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  const mobile = ipad || /Android|iPhone|iPad|iPod/i.test(ua);
  const mac = !mobile && /Mac/i.test(ua);

  document.querySelectorAll('[data-dl]').forEach((a) => {
    const kind = a.dataset.dl;
    if (kind === 'alt') {
      if (mobile) return a.remove();
      a.href = mac ? WIN : MAC;
      a.textContent = mac ? 'Também tem para Windows' : 'Também tem para macOS';
      a.hidden = false;
      return;
    }
    if (mobile) {
      a.href = a.dataset.mobileHref || '/instalar/';
      a.textContent = a.dataset.mobileText || (kind === 'nav' ? 'Instalar' : 'Instalar no celular');
    } else if (mac) {
      a.href = MAC;
      if (kind !== 'nav') a.textContent = 'Baixar para macOS';
    }
  });
  if (mobile) document.querySelectorAll('[data-desktop-only]').forEach((el) => el.remove());
})();
