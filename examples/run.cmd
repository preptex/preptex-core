node ..\cli\dist\cli.js transform --input "..\\examples\\basic\\main.tex" --output "..\\examples\\out\\basic-output.tex"

node ..\cli\dist\cli.js transform --input "..\\examples\\basic\\main.tex" --output "..\\examples\\out\\basic-noc.tex" --suppress-comments

node ..\cli\dist\cli.js transform --input "..\\examples\\basic\\main.tex" --output "..\\examples\\out\\basic-conditions.tex" --if-branches test,long