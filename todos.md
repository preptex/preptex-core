- Make parser aware of section commands?
- Link section name and shortname to section
- Boolean for starred sections

- Parse math-mode
- Parse `\ifX` / `\else` / `\fi`
- Parse comments and comment env

implement mathmode handler. similar to groups and environments, just push on stack, append to parent and pop on exit. for dollar symbol check parent if also dollar symbol then its exiting else it is opening

- Bug in lexer: '\\text' : reading '\\t', keeping as text

- Add tokenize options to lexer.
- Add a layer after tokenizer that analyse file and turns off contradicting tokens and run tokenizer again.
