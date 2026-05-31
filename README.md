# ROT-JS

Prototipo de roguelike em JavaScript usando Vite e `rot-js`.

## Rodando o projeto

```bash
npm run dev
```

O Vite faz reload automatico durante o desenvolvimento. Para mudancas comuns em `src/`, nao precisa rodar build.

## Visual atual do jogo

O mapa e desenhado em um canvas customizado, visto de cima em uma grade regular.

Simbolos usados hoje:

- `@`: jogador.
- Paredes: desenhadas com imagens.
- Chao/caminho livre: desenhado com imagem.
- Simbolos claros: area visivel agora.
- Simbolos escuros: area fora da visao atual ou ainda pouco conhecida.

## Como o mapa e criado

O mapa e pseudoaleatorio. Isso significa que ele parece aleatorio, mas pode ser reproduzido quando usamos a mesma seed.

Fluxo atual:

- `ROT.RNG.setSeed(seed)`: define a seed.
- `ROT.Map.Cellular`: gera uma caverna baseada em automato celular.
- `randomize(0.47)`: cria a distribuicao inicial de paredes e chao.
- `create()`: suaviza o mapa em algumas rodadas.
- `connect()`: conecta as regioes abertas para deixar o mapa jogavel.

## Recursos do `rot-js`

O `rot-js` nao entrega NPCs, inimigos ou itens prontos. Ele funciona como uma caixa de ferramentas para construir roguelikes.

Recursos principais:

- `ROT.Map`: geradores de mapa, como `Cellular`, `Digger`, `Uniform`, `Rogue`, `Arena`, `DividedMaze`, `IceyMaze` e outros.
- `ROT.RNG`: numeros pseudoaleatorios com seed, util para repetir mapas e eventos.
- `ROT.FOV`: campo de visao, usado para saber o que o jogador consegue enxergar.
- `ROT.Path.AStar`: pathfinding para inimigos perseguirem o jogador ou NPCs encontrarem caminhos.
- `ROT.Path.Dijkstra`: pathfinding baseado em distancia, bom para mapas de custo e rotas simples.
- `ROT.Scheduler`: agenda turnos entre jogador, inimigos, NPCs e outros atores.
- `ROT.Engine`: motor de turnos que trabalha junto com o scheduler.
- `ROT.Lighting`: calculo de iluminacao.
- `ROT.Display`: render ASCII/tile original da biblioteca.

## Ideias para entidades

A biblioteca nao define os simbolos. A gente escolhe no jogo.

Possiveis convencoes:

- `g`: inimigo simples.
- `O`: inimigo forte.
- `n`: NPC neutro.
- `!`: item ou pocao.
- `>`: saida, escada ou portal.

Para inimigos, um caminho natural seria criar uma lista de entidades no estado do jogo e usar `ROT.Path.AStar` para calcular passos em direcao ao jogador. Para turnos mais organizados, podemos introduzir `ROT.Scheduler` e `ROT.Engine`.
