FROM nikolaik/python-nodejs:python3.10-nodejs18-alpine
LABEL authors="petrpopov"

WORKDIR app/

COPY requirements.txt requirements.txt
COPY package.json package.json

RUN pip3 install --upgrade pip setuptools wheel
RUN pip3 install --no-warn-script-location --no-cache-dir -r requirements.txt
RUN npm install

COPY . .

CMD ["node", "main.js"]