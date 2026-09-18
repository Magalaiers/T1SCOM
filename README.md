# MM PitWall

Este projeto serve de modelo para o  trabalho 1 desenvolvido na matéria de Sistemas Computacionais. Com base no jogo Motorsport Manager, criou-se um comparador de pilotos do banco de dados dele. O foco deste trabalho está na aprendizagem de desenvolvimento de web funcional e acessível. 

## Execução do Projeto
A partir da base de dados de pilotos (Drivers.csv) e de equipes (Teams.csv), o arquivo 'converter.py' é necessário para gerar um arquivo dados.json e o JavaScript consegue pegar essas informações pelo comando 'fetch'. 

Por esse motivo, o navegador bloqueia a abertura do arquivo com dois cliques ('file:///...') devido às regras de segurança de CORS, sendo necessário iniciar em um servidor local. 

