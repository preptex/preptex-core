node ..\cli\dist\cli.js transform --input "..\\examples\\basic\\main.tex" --output "..\\examples\\basic\\output.tex"

node ..\cli\dist\cli.js transform --input "..\\examples\\basic\\main.tex" --output "..\\examples\\basic\\noc.tex" --suppress-comments

node ..\cli\dist\cli.js transform --input "..\\examples\\basic\\main.tex" --output "..\\examples\\basic\\conditions.tex" --if-branches test,long