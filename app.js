const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({extended: true}));
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));


app.get('/', (req, res) => res.render('index'));
app.listen(PORT, () => {
  console.log(`server ready on ${PORT}`);
})

app.post('/', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.render('error', {
      message: 'Please set both username and password',
    })
    return
  }
  console.log(req.body, username, password)
  res.end()
})

