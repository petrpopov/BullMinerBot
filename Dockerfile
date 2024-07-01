FROM nikolaik/python-nodejs:python3.10-nodejs18-alpine
LABEL authors="petrpopov"

WORKDIR app/

COPY server/requirements.txt requirements.txt

RUN pip3 install --upgrade pip setuptools wheel git
RUN pip3 install --no-warn-script-location --no-cache-dir -r requirements.txt

COPY . .

RUN npm cache clean -f
RUN rm -rf node_modules
RUN npm install --verbose

CMD ["node", "main.js"]