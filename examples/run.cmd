node ..\cli\dist\index.js transform --input "basic.tex" --out-dir ".\\dist" --recursive

node ..\cli\dist\index.js transform --input "basic.tex" --out-dir ".\\dist" --suppress-comments --output "noc.tex"

node ..\cli\dist\index.js transform --input "basic.tex" --out-dir ".\\dist" --if-branches test,long --output "branches.tex"


node ..\cli\dist\index.js transform --input "basic.tex" --out-dir ".\\dist" --flatten --output "flattened.tex"