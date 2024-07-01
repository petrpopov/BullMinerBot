FROM nikolaik/python-nodejs:python3.10-nodejs18-alpine
LABEL authors="petrpopov"

WORKDIR app/

COPY . .

RUN apk update
RUN apk --update add nano vim curl wget links supervisor git
RUN pip3 install --upgrade pip setuptools wheel
RUN pip3 install --no-warn-script-location --no-cache-dir -r server/requirements.txt
RUN npm install --save

CMD ["node", "main.js"]