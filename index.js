// const openai = require('openai');
const bodyParser = require('body-parser');

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 5000;
const fetch = require('node-fetch');
var jwt = require('jsonwebtoken');


// middleware ---->
app.use(cors());
app.use(express.json());
app.use(bodyParser.json())

// jwt verification
const verifyJWT = async (req, res, next) => {
  const authorization = req.headers.authorization;
  if(!authorization){
    return res.status(401).send({error: true, message: 'Unauthorized Access'});
  }
  const token = authorization.split(' ')[1];
  jwt.verify(token, process.env.AuthSecret, (error, decoded) => {
    if(error){
      return res.status(403).send({error: true, message: 'Unauthorized Access'})
    }
    res.decoded = decoded;
    next();
  })
}


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster1.some2ew.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    // Collections
    const generatedScriptCollections = client.db('NolanAIScripts').collection('generatedScripts');

    /*************************
     * JWT
     *************************/
    app.post('/jwt', (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.AuthSecret, {
        expiresIn: '1hr'
      });
      res.send({token});
    })

    /*************************
     * Script API's Start
     *************************/

    app.post('/scripts', async (req, res) => {
      try {
          const scriptPrompt = req.body;  
          const response = await fetch(
              'https://api.openai.com/v1/chat/completions',
              {
                  method: 'POST',
                  body: JSON.stringify({
                      model: 'gpt-3.5-turbo',
                      messages: [{ role: 'system', content: 'You are a script writer.' }, { role: 'user', content: scriptPrompt.synopsis + 'content genre would be' + scriptPrompt.genre + 'make this within 200 words', }]
                  }),
                  headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${process.env.GPT_SECRET}`
                  }
              }
          );

          res.send(response)
  
          if (!response.ok) {
              throw new Error(`Error response from ChatGPT API: ${response.status} ${response.statusText}`);
          }
  
          const responseData = await response.json();
          const generatedScript = responseData.choices[0].message.content;

          const result = await generatedScriptCollections.insertOne({
            prompt: scriptPrompt.synopsis,
            title: scriptPrompt.title,
            genre: scriptPrompt.genre,
            email: scriptPrompt.email,
            generatedScript: generatedScript,
            createdAt: new Date()
          })

          res.send({result})
  
        } catch (error) {
            console.error('Error generating and saving script:', error);
            res.send({ error: 'An error occurred while generating and saving script' });
        }
    });

    app.get('/scripts/:email', verifyJWT, async (req, res) => {
      try {
        const email = req.params.email;
        const query = {email: email}
        const result = await generatedScriptCollections.find(query).toArray();
        res.status(200).send(result);
      } catch (error) {
        console.error('Error sending scripts:', error);
        res.status(500).send({ error: 'An error occurred while generating and saving script' });
      }
    })

    app.get('/specific-scripts/:id', async (req, res) => {
      const id = req.params.id;
      const query = {_id: new ObjectId(id)}
      const result = await generatedScriptCollections.findOne(query);
      res.send(result)
    })

    app.put('/edit-scripts/:id', async (req, res) => {
      const id = req.params.id;
      const filter = {_id: new ObjectId(id)}
      const options = {upsert: true}
      const requestedChanges = req.body;
      const updatedScript = {
        $set: {
          title: requestedChanges.title,
          generatedScript: requestedChanges.generatedScript
        }
      }
      const result = await generatedScriptCollections.updateOne(filter, updatedScript, options);
      res.send(result)
    })

    app.delete('/scripts/:id', async (req, res) => {
      const id = req.params.id;
      const query = {_id: new ObjectId(id)}
      const result = await generatedScriptCollections.deleteOne(query);
      res.send(result)
    })

    /*************************
     * Script API's End
    *************************/


    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Nolan Server Connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Nolan Server')
})

app.listen(port, () => {
    console.log(`Nolan Server running on port ${port}`);
})