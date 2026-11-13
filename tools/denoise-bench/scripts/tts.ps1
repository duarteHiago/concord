# Gera frases faladas com a voz do Windows (System.Speech) em WAV 48 kHz mono 16 bits.
# Uso: powershell -File tts.ps1 -Out pasta -Lang pt-BR
# Sem voz no idioma pedido, usa a primeira disponível e avisa (o nome do arquivo leva a cultura da voz).
param(
  [Parameter(Mandatory = $true)][string]$Out,
  [string]$Lang = 'pt-BR'
)
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voices = $synth.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { $_.VoiceInfo }
$pick = $voices | Where-Object { $_.Culture.Name -eq $Lang } | Select-Object -First 2
if (-not $pick) { $pick = $voices | Select-Object -First 2; Write-Warning "Sem voz $Lang; usando $($pick[0].Name) ($($pick[0].Culture.Name))" }
$pt = @(
  'Oi pessoal, tudo bem? Hoje a gente vai testar a supressão de ruído do Concord com teclado e ventilador ligados.',
  'Preciso que vocês me digam se a minha voz está cortando ou se ficou abafada em algum momento da frase.',
  'Sete, quatorze, vinte e um, vinte e oito. Palavras curtas: sim, não, já, pá, tá, bem, mal.',
  'Esse microfone é USB e às vezes se apresenta em estéreo com um lado vazio, então a mistura precisa ser esperta.'
)
$en = @(
  'Hi everyone, how is it going? Today we are testing the noise suppression with the keyboard and the fan on.',
  'Please tell me if my voice cuts out or sounds muffled at any point during this sentence.',
  'Seven, fourteen, twenty one, twenty eight. Short words: yes, no, now, go, stop, well, bad.',
  'This USB microphone sometimes shows up as stereo with one empty side, so the downmix has to be careful.'
)
$phrases = if ($pick[0].Culture.Name -like 'pt*') { $pt } else { $en }
New-Item -ItemType Directory -Force $Out | Out-Null
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(48000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$i = 0
foreach ($v in $pick) {
  $synth.SelectVoice($v.Name)
  $synth.Rate = 0
  foreach ($p in $phrases) {
    $i++
    $file = Join-Path $Out ("voz{0:D2}-{1}.wav" -f $i, $v.Culture.Name)
    $synth.SetOutputToWaveFile($file, $fmt)
    $synth.Speak($p)
    $synth.SetOutputToNull()
    Write-Output $file
  }
}
$synth.Dispose()
