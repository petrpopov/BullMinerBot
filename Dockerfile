FROM nikolaik/python-nodejs:python3.10-nodejs18-alpine
LABEL authors="petrpopov"

WORKDIR app/

COPY server/requirements.txt requirements.txt

RUN apk update
RUN apk --update add nano vim curl wget links git
RUN pip3 install --upgrade pip setuptools wheel
RUN pip3 install --no-warn-script-location --no-cache-dir -r requirements.txt

COPY . .

RUN npm install dotenv --save
RUN npm install --verbose --save

CMD ["node", "main.js"]