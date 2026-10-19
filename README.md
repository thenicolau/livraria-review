# Entrelinhas

Seu diário pessoal de leitura, executado **na sua máquina**, com uma interface em português e um arquivo Markdown para cada livro. Sem banco de dados, conta no aplicativo ou dependências npm.

## Começar

Requer **Node.js 22 ou superior**. Para sincronizar, requer também **Git** e uma conta GitHub autenticada na máquina.

```sh
npm start
```

Abra [http://127.0.0.1:3210](http://127.0.0.1:3210). No Windows, também pode dar dois cliques em `iniciar.bat`. Mantenha o terminal aberto enquanto usar o sistema. Não é necessário executar `npm install`.

Para usar outra porta no PowerShell: `$env:PORT=3211`, depois `npm start`.

## O que você pode fazer

- Buscar título, autor ou ISBN na [Open Library](https://openlibrary.org/dev/docs/api/search), com capa e dados públicos, ou cadastrar manualmente. Confira os dados da edição escolhida; páginas e capas nem sempre estão disponíveis.
- Colar o link de uma obra (`openlibrary.org/works/…`) ou edição (`openlibrary.org/books/…`) no campo **Link da Open Library** do cadastro e clicar em **Preencher pelo link**. Preenche título, autores, capa e páginas disponíveis, sem salvar o cadastro automaticamente nem alterar review, avaliação ou marcações. Links com uma edição selecionada usam essa edição; uma obra sem edição não tem seu número de páginas estimado. A busca comum também reconhece esses links.
- Registrar status (quero ler, lendo, concluído, pausado, abandonei), nota de 1 a 5 com até duas casas decimais (como `4,75` ou `4.75`), mês de início, conclusão e pausa. A nota exata aparece nos cartões, filtros e médias.
- Escrever reviews e notas em Markdown; guardar trechos manualmente ou importar um arquivo Kindle.
- Registrar páginas lidas por mês, opcionalmente, para comparar o volume de leitura.
- Filtrar livros por título, autor, status e nota; ordenar por título, nota, atualização ou duração.
- Consultar gráficos mensais, tabela acessível, autores mais e menos lidos e intervalo de leitura por livro.
- Baixar o Markdown de um livro ou sincronizar sistema e reviews com GitHub.

O ranking de autores conta somente livros concluídos e considera todos os anos. Autores empatados têm a mesma contagem. A duração é a diferença entre meses (por exemplo, janeiro a março = 2 meses; janeiro a janeiro = “no mesmo mês”), **não** dias ou tempo efetivo de leitura. Início, conclusão e pausa são eventos registrados, mesmo que você altere o status depois. Há um campo para a última pausa; múltiplos ciclos de pausa/retomada e releituras devem ser registrados nas notas ou em cadastros separados.

O gráfico de livros conta eventos de início, conclusão e pausa; páginas conta os valores registrados manualmente. Meses sem registro têm valor zero. A comparação de mais/menos usa apenas meses já decorridos do ano selecionado, incluindo o mês atual. O total de páginas do livro não é distribuído automaticamente nos meses.

## Seus arquivos Markdown

Os livros ficam em `reviews/<id>.md`. O ID estável evita renomear o arquivo quando o título muda. Salvar um cadastro grava o Markdown imediatamente, com escrita por arquivo temporário e substituição; o botão de sincronização não é necessário para salvar localmente.

O cabeçalho delimitado por `---` contém JSON (também válido como YAML), com título, autores, datas, nota, páginas e marcações estruturadas. Abaixo ficam o review, as notas e uma visualização das marcações em citações Markdown.

Você pode editar review e notas diretamente no arquivo, mantendo os comentários `<!-- entrelinhas:... -->` que separam as seções. Para alterar datas e marcações diretamente, edite os campos do cabeçalho JSON. As citações no fim são uma visualização gerada a partir do cabeçalho e serão atualizadas ao salvar pelo aplicativo. Recarregue a interface após uma edição externa; não edite o arquivo e o formulário aberto simultaneamente.

Arquivos inválidos são preservados e exibidos como avisos, em vez de serem sobrescritos silenciosamente. Faça backup da pasta `reviews/` ou sincronize com frequência. Excluir um livro remove seu arquivo local; versões anteriores só podem ser recuperadas se já estiverem em um commit ou backup.

## Sincronização com GitHub

1. Crie um repositório **vazio** no GitHub, preferencialmente privado. Não adicione README pelo GitHub na criação.
2. Configure sua identidade Git, se ainda não estiver configurada:

   ```sh
   git config --global user.name "Seu nome"
   git config --global user.email "seu-email"
   ```

3. Autentique o Git usando Git Credential Manager, uma chave SSH já configurada, ou [GitHub CLI](https://cli.github.com/) com `gh auth login` e `gh auth setup-git`. Não coloque tokens na URL.
4. Em **Configurações**, salve `https://github.com/usuario/repositorio.git` ou `git@github.com:usuario/repositorio.git`.
5. Clique em **Sincronizar**. No primeiro uso, o sistema inicializa um repositório na pasta, se necessário, e cria a branch `main`. Ele executa fetch, verifica o histórico remoto, prepara os arquivos, cria um commit se houver alterações e faz push.

São incluídos `reviews/`, `public/`, `lib/`, `tests/`, `server.mjs`, `package.json`, `package-lock.json` (quando existir), `README.md`, `.gitignore` e `iniciar.bat`. Arquivos arbitrários fora dessa lista não são adicionados. `.local/` guarda apenas configuração e data da última sincronização e está ignorada pelo Git. Nenhum token é salvo pelo aplicativo.

O aplicativo não faz push forçado nem resolve divergências automaticamente. Se o remoto tiver alterações ausentes na máquina, integre-as pelo terminal e tente novamente. Se o push falhar após o commit, o commit local é preservado para a próxima tentativa. A sincronização inicial pode demorar enquanto o Git autentica; diálogos de login do sistema podem ser exibidos. O repositório remoto precisa já existir: o botão não cria repositórios no GitHub.

## Marcações do Kindle

Em **Marcações → Importar do Kindle**, selecione `My Clippings.txt` (ou `Meus recortes.txt`) copiado do dispositivo por USB, quando esse arquivo estiver disponível. O fluxo reconhece formatos comuns em português e inglês, oferece uma prévia e permite associar cada grupo a um livro existente, criar um livro ou ignorar o grupo. Novos livros importados ficam em “Quero ler” até você ajustar o status. Trechos repetidos com a mesma localização são ignorados na importação; marcadores vazios não são importados.

A disponibilidade e o acesso ao arquivo variam por modelo e versão do Kindle. Não há autenticação na Amazon nem sincronização automática com a conta Kindle. A inclusão manual funciona independentemente disso. O suporte ao arquivo se baseia no formato de recortes documentado nos [manuais Kindle](https://s3.amazonaws.com/kindle/Kindle2_Users_Guide.pdf).

A importação associa os trechos aos registros existentes pelo título e autor informados no arquivo. Reconhece acentos, pontuação, nomes de autor em ordem invertida e um subtítulo adicional quando o autor também corresponde. Sem correspondência segura, com autor divergente ou com registros duplicados, pergunta a qual livro as notas pertencem. Sem essa escolha, nenhuma nota é importada. Você pode escolher um registro existente, criar um livro ou ignorar o grupo; os trechos ficam disponíveis na prévia para ajudar a decidir.

As associações confirmadas ficam no campo `kindleSources` do próprio Markdown e são reutilizadas nas próximas importações, inclusive para títulos traduzidos ou muito diferentes. Alterar uma associação muda o destino das próximas importações, sem apagar notas já importadas. Reviews, avaliações e notas pessoais existentes são preservados; apenas as marcações novas são anexadas. A identificação usa os metadados do arquivo, não tenta adivinhar o livro pelo conteúdo de uma citação isolada.

## Privacidade e funcionamento offline

O servidor escuta somente em `127.0.0.1`. As gravações exigem um token da sessão e origem local, com verificação de host. Reviews, notas e marcações ficam no disco local e só são enviados ao GitHub quando você sincroniza. Busca envia apenas a consulta para Open Library; capas são carregadas de URLs HTTPS no navegador. A busca, as capas remotas e o GitHub precisam de internet. Cadastro manual, edição, gráficos e importação de arquivo funcionam offline; capas não são armazenadas em cache local pelo sistema.

## Desenvolvimento e verificação

```sh
npm run dev
npm run check
npm test
```

Os testes cobrem persistência Markdown, validação, importação Kindle, estatísticas, API local, proteção contra origens externas e decisões da sincronização Git (sem enviar dados a um repositório real).

Estrutura: `server.mjs` serve a API e interface; `lib/books.mjs` gerencia Markdown e importação; `lib/stats.mjs` calcula estatísticas; `lib/git.mjs` faz a sincronização; `public/` contém a interface em HTML, CSS e JavaScript.
