# File-Portal-RTC © Albert Bregonia 2021

# Simple Python script to combine the HTML/CSS/JS into one HTML file and minimize the total file size
import re
with (open('file-transfer.html', 'w') as output, 
      open('index.html', 'r') as html,
      open('index.css', 'r') as css,
      open('index.js', 'r') as js):
    output.write(re.sub(
        r'\s{2,}|\n', '', #remove whitespace of length > 2 or \n's
        re.sub(
            r'//.*', '', #delete all comments
            html.read()
            .replace('<link rel="stylesheet" href="index.css">', f'<style>{css.read()}</style>')
            .replace('<script src="index.js"></script>', f'<script>{js.read()}</script>')
        )
    ))