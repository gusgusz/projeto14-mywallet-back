import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import cors from "cors";
import dotenv from "dotenv";
import joi from "joi";
import bcrypt from "bcrypt";
import { v4 as uuidV4 } from "uuid";
import dayjs from "dayjs";
//meu token cd9ddb98-10c2-40d4-a19a-3ce83024d2bb



const signUpSchema = joi.object({
    name: joi.string().min(3).required(),
    email: joi.string().email().required(),
    password: joi.string().min(6).required(),
    repeatPassword: joi.ref('password')

});


const signInSchema = joi.object({
    email: joi.string().email().required(),
    password: joi.string().min(6).required(),
});

const transactionSchema = joi.object({
    value: joi.number().required(),
    titleDescription: joi.string().min(1).required(),
    description: joi.string().required(),
    type: joi.string().required().valid('in', 'out'),
    
});
// console.log(transactionSchema.validate({ date: '01-01-2021' }));


const app = express();
dotenv.config();
app.use(cors());
app.use(express.json());

const mongoClient = new MongoClient(process.env.MONGO_URI);
let db;

try{
    await mongoClient.connect();
    console.log("Connected to MongoDB");
}catch(err){
    console.log(err);
}

db =  mongoClient.db("mywallet");
const users =  db.collection("users");
const sessions = db.collection("sessions");
const accounts = db.collection("accounts");




app.post("/sign-up", async (req, res) => {
    const validation = signUpSchema.validate(req.body , {abortEarly: false});
    if(validation.error){
        const errors = validation.error.details.map(detail => detail.message);
        res.status(400).send(errors);
        return;
    }
    const user = req.body;
    delete user.repeatPassword;
    const hashPassword = bcrypt.hashSync(user.password, 10);
    user.password = hashPassword;
    console.log(user);
try{

if(await users.findOne({email: user.email})){
    res.status(409).send("Email already registered");
    return;
}
    await users.insertOne(user);
    res.sendStatus(201);
}catch{
    res.sendStatus(500);
}
});

app.post("/sign-in", async (req, res) => {
    const user = req.body;
    const validation = signInSchema.validate(req.body , {abortEarly: false});

    if(validation.error){
        const errors = validation.error.details.map(detail => detail.message);
        res.status(400).send(errors);
        return;
    }
    
    try{
        
    if(!await users.findOne({email: user.email})){
        res.status(401).send("Invalid email");
        return;
    }
    const userDb = await users.findOne({email: user.email});
    const isPassword = await bcrypt.compare(user.password, userDb.password);
    if(isPassword && userDb){
        const token = uuidV4();
        if(await sessions.findOne({userId: userDb._id})){
            return res
            .status(401)
            .send({ message: "Você já está logado" });
        }
        await sessions.insertOne({token, userId: userDb._id});
        res.status(200).send({token, name: userDb.name});
    }
}catch{
    res.sendStatus(500);
}
});

app.post("/accounts", async (req, res) =>{
    const { authorization } = req.headers; // Bearer Token

    const token = authorization?.replace("Bearer ", "");
    const body = req.body;
    const validation = transactionSchema.validate(body, {abortEarly: false});
    const userSession = await sessions.find({token}).toArray();
    if(!token || !userSession){
        return res.sendStatus(401);
    }
    if(validation.error){
        const errors = validation.error.details.map(detail => detail.message);
        res.status(400).send(errors);
        return;
    }
   
    try{
        const userId  = userSession[0].userId;
        const isAccount = await accounts.find({userId}).toArray();
        body.date = dayjs().format("DD/MM/YYYY");
        

    if(isAccount.length !== 0){
        await accounts.updateOne({userId}, {$push: {transactions: body}});
        console.log(body);
        res.sendStatus(201);
        return;
    }
        
        const bodyN = {userId, transactions: [body]};
        await accounts.insertOne(bodyN);
        res.sendStatus(201);
       
    

    }catch{
        res.sendStatus(500);
    }


    
    
});

app.get("/accounts", async (req, res) => {
    const { authorization } = req.headers; 

  const token = authorization?.replace("Bearer ", "");
  const userSession = await sessions.findOne({token});
    if(!token || !userSession){
        return res.sendStatus(401);
    }
    
    const userDb = await users.findOne({_id: userSession.userId});
    const userId = userDb._id;
    
    try{
        const content = await accounts.findOne({userId});
        if(!content){
            return res.send([]);
        }
        const transactions = content.transactions;
        res.send(transactions);
    }catch{
        res.sendStatus(500);
    }
});

app.listen(5000);