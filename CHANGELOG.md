# Changelog

## 0.6.0

- **Ícones personalizados agora são copiados**: ao escolher uma imagem, o app guarda uma cópia em `%APPDATA%\Prism-Radial\custom-icons` e usa essa cópia. O arquivo original pode ser movido ou apagado.
  - Escolher a mesma imagem de novo reaproveita a cópia; imagens diferentes com o mesmo nome não se sobrescrevem.
  - Ícones escolhidos na 0.5.0 continuam apontando para o arquivo original; escolha a imagem de novo para criar a cópia.
- **Tema Prisma: anéis giratórios**: três círculos de segmentos em volta do menu, girando devagar em sentidos alternados. Param quando o Windows está com "reduzir animações".

## 0.5.0

- **Opacidade do menu**: novo controle em Configurações → Aparência (20% a 100%). Deixa o fundo das fatias, do anel e do centro translúcido; ícones, textos e bordas continuam nítidos.
- **Ícones personalizados**: cada fatia ou subitem pode usar uma imagem própria (PNG, SVG, ICO, JPG, WebP ou GIF, até 2 MB), em Configurações → Itens do menu → "Usar imagem própria".
  - Se a imagem não carregar (arquivo movido ou apagado), o ícone embutido escolhido é usado no lugar.
  - As imagens ficam em cache enquanto o app está aberto, então o menu abre sem reler o disco.

## 0.4.1

- **Correção:** a gravação de um atalho novo ficava esperando e não reconhecia a combinação.
  - O gancho de teclado agora responde na hora e envia o resultado separado, para o Windows não desligá-lo no meio da gravação.
  - Se o gancho falhar mesmo assim, a caixa grava a combinação pela própria tela. Só combinações com a tecla Win dependem do gancho.

## 0.4.0

- **Novo nome: Prism Radial.** Fork do [Kira Radial](https://github.com/Hideki515/Kira-Radial), de Hideki515. As configurações agora ficam em `%APPDATA%\Prism-Radial`, então o app pode ficar instalado junto com o Kira.
- **Tema Prisma (novo padrão)**: um cubo de cristal animado no centro do menu.
  - Acompanha o mouse em camadas (parallax) e inclina em 3D; vira-se para a fatia sob o cursor.
  - Núcleo de luz, raios, partículas em órbita e separação de cores nas bordas.
  - Ajustes em Configurações → Aparência: proximidade, parallax, inclinação, brilho, aberração cromática, "olhar para a fatia" e respiração.
  - O relógio e o medidor de CPU não aparecem neste tema.
  - Respeita "reduzir animações" do Windows.

## 0.3.4

- **Correção:** o ícone não sumia ao escolher "Esconder ícone" (no botão direito ou na bandeja), ao trocar o modo de abertura para "Atalho" nem em tela cheia.

## 0.3.3

- **Esconder o ícone em tela cheia**: o ícone some durante jogos, vídeos e apresentações em tela cheia e volta sozinho ao sair. A opção vem ligada e pode ser desligada em Configurações → Ícone.
- O menu do botão direito no ícone agora fecha ao clicar fora.

## 0.3.2

- **Página "Ícone" nas configurações**:
  - Pré-visualização animada.
  - Tamanho (56–160 px) e opacidade em repouso.
  - Botão "Voltar o ícone para o canto".
- **Imagem própria para o ícone** (GIF, WebP ou PNG animado, até 8 MB). Se a imagem não carregar, o orbe embutido é usado.
- **Botão direito no ícone**: Configurações e "Esconder ícone".
- **Bandeja**: item "Mostrar/esconder ícone".

## 0.3.1

- **Animação de abertura pelo ícone**: o menu nasce do ícone.
  - O núcleo cresce do tamanho do ícone, o fundo e os anéis se expandem girando e as fatias surgem em sequência no sentido horário.
  - Ao fechar (Esc, clique fora ou no centro), o menu se recolhe de volta para o ícone.
  - Pelo atalho, o menu continua abrindo e fechando como antes.
  - A animação é desligada quando o Windows está com "reduzir animações".

## 0.3.0

- **Ícone flutuante** (orbe holográfico animado) que abre o menu com um clique.
  - Pode ser arrastado para qualquer lugar da tela, inclusive para outro monitor; a posição fica salva.
  - O menu abre centrado no ícone.
- **Escolha como abrir o menu**: Atalho · Ícone · Ícone + atalho (em Configurações → Atalho). No modo "Ícone", o atalho global fica desligado.
- A versão exibida nas configurações agora vem do `package.json`.

## 0.2.0

- **Tema "Holográfico"**: HUD em wireframe.
  - Esfera com meridianos animados, órbitas inclinadas, réguas graduadas, varredura de radar e retícula no hub.
  - A cor segue o destaque, âmbar por padrão.
  - Escolha em Configurações → Aparência → Tema. O tema "Vidro" continua sendo o padrão.

## 0.1.0

Primeira versão.

- **Menu radial**
  - Visual "frosted glass", com abertura no cursor e ajuste ao monitor e DPI.
  - Até 10 fatias e sub-anéis de até 8 itens.
  - O sub-anel abre com clique ou Enter. Esc ou Backspace voltam para o anel principal.
  - Navegação por mouse, teclado e roda.
- **Atalho global**
  - Configurável, com padrão Ctrl+Alt+Q.
  - Modos pressionar/clicar e segurar/soltar.
  - Gravador aceita a tecla Win e teclados ABNT2.
- **Ações**
  - Programa, arquivo, pasta e URL.
  - Atalho de teclado com atraso opcional. O menu some da tela antes do envio.
  - Mídia, sem fechar o menu.
  - Sistema: bloquear, suspender, desligar, reiniciar, sair, print e Gerenciador de Tarefas.
  - Scripts PowerShell e CMD.
  - Troca da saída de áudio, para um dispositivo fixo ou alternando entre eles.
- **Submenu automático de saídas de áudio**: a saída em uso aparece destacada.
- **Perfis por aplicativo**, escolhidos pelo executável em primeiro plano.
- **Tela de configurações**
  - Pré-visualização ao vivo.
  - Backup e restauração da configuração.
  - Bandeja do sistema e início automático com o Windows.
- **Redução de falsos positivos de antivírus**
  - Metadados completos no executável.
  - O uso de CPU e RAM é lido sem varrer processos.
  - Desligar e reiniciar usam a API do Windows.
  - Scripts deixaram de usar `-ExecutionPolicy Bypass` e não ficam mais ocultos por padrão.
