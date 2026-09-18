# MM PitWall

Este projeto serve de modelo para o  trabalho 1 desenvolvido na matéria de Sistemas Computacionais. Com base no jogo Motorsport Manager, criou-se um comparador de pilotos do banco de dados dele. O foco deste trabalho está na aprendizagem de desenvolvimento web semântico, funcional e acessível. 

## Execução do Projeto
A partir da base de dados de pilotos (Drivers.csv) e de equipes (Teams.csv), o arquivo 'converter.py' é necessário para gerar um arquivo dados.json e o JavaScript consegue pegar essas informações pelo comando 'fetch'. 

Por esse motivo, o navegador bloqueia a abertura do arquivo com dois cliques ('file:///...') devido às regras de segurança de CORS, sendo necessário iniciar em um servidor local. 

Observação: Não é necessário executar o arquivo em python (converter.py), o arquivo dados.json já está incluso. Caso o objetivo seja reprocessar os dados, é necessário abrir o cmd na pasta raiz onde estão os arquivos e escrever o seguinte comando abaixo:
> ```bash
> python converter.py
> ``` 

Para fazer isso é necessário abrir um prompt de comando escrevendo cmd no caminho da pasta de arquivos do projeto e escrever na tela:
> ```bash
>python -m http.server 8000
> ``` 
E abrir no navegador o seguinte link:
> ```bash
>http://localhost:8000
> ``` 

Outra opção está na utilização do Visual Studio Code. Com a extensão Live Server, clique com botão direito no index.html e selecione 'Open with Live Server', então aparecerá uma tela ao lado dividida com a visualização do site.