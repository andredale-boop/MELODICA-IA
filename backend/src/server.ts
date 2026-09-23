import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { Pool } from 'pg';
import { google } from 'googleapis';
import { randomUUID, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdir, writeFile, unlink, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { CREDIT_COSTS, grantVerifiedPurchase, reserveCredits, reserveCreditsTx, settleCredits, settleCreditsTx } from './credits.js';
import { kitsConfigured } from './kits.js';

import { soundverseUploadAudio, soundverseCreateVoiceClone, soundverseGenerateSong, soundverseGetGeneration, soundverseDownloadFile, soundverseRevokeVoiceConsent } from './soundverse.js';
import { replicateConfigured, generateAiSong, cloneVoice } from './replicate.js';
const app=express();
const pool=process.env.DATABASE_URL?new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined}):null;
app.use(helmet()); app.use(cors({origin:process.env.CORS_ORIGIN?.split(',').map(s=>s.trim())??false})); app.use(express.json({limit:'256kb'}));
const secret=process.env.JWT_SECRET; if(!secret||secret.length<32) throw new Error('JWT_SECRET must be configured with at least 32 characters');
const jwtSecret=secret; const assetsDir=path.resolve(process.env.ASSETS_DIR??'./assets');
await mkdir(assetsDir,{recursive:true});
const providerGateway=process.env.PROVIDER_GATEWAY_URL?.replace(/\/$/,'');
const providerKey=process.env.PROVIDER_GATEWAY_API_KEY;
const openAiModel=process.env.OPENAI_MODEL?.trim();

const GOOGLE_PLAY_PACKAGE_NAME = 'com.melodica.ai';

function getGooglePlayPublisher() {
 const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
 if (!raw) throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_NOT_CONFIGURED');

 let credentials: {
   client_email?: string;
   private_key?: string;
 };

 try {
   credentials = JSON.parse(raw);
 } catch {
   throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_INVALID');
 }

 if (!credentials.client_email || !credentials.private_key) {
   throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_INVALID');
 }

 const auth = new google.auth.GoogleAuth({
   credentials,
   scopes: ['https://www.googleapis.com/auth/androidpublisher']
 });

 return google.androidpublisher({
   version: 'v3',
   auth
 });
}

async function verifyGooglePlayPurchase(productId: string, purchaseToken: string) {
 const publisher = getGooglePlayPublisher();

 const result = await publisher.purchases.products.get({
   packageName: GOOGLE_PLAY_PACKAGE_NAME,
   productId,
   token: purchaseToken
 });

 const purchase = result.data;

 if (purchase.purchaseState !== 0) {
   return {
     verified: false,
     reason: 'PURCHASE_NOT_COMPLETED'
   };
 }

 return {
   verified: true,
   productId,
   consumptionState: purchase.consumptionState,
   acknowledgementState: purchase.acknowledgementState
 };
}



type Req=express.Request&{userId?:string};
function sign(userId:string){return jwt.sign({sub:userId},jwtSecret,{algorithm:'HS256',expiresIn:'30d'});}
function auth(req:Req,res:express.Response,next:express.NextFunction){const h=req.header('authorization');if(!h?.startsWith('Bearer '))return res.status(401).json({error:'UNAUTHORIZED'});try{const p=jwt.verify(h.slice(7),jwtSecret,{algorithms:['HS256']}) as jwt.JwtPayload;if(typeof p.sub!=='string')throw new Error();req.userId=p.sub;next()}catch{return res.status(401).json({error:'INVALID_TOKEN'})}}
function hashPassword(password:string){const salt=randomBytes(16).toString('hex');return `scrypt:${salt}:${scryptSync(password,salt,64).toString('hex')}`}
function verifyPassword(password:string,stored:string){const [kind,salt,hash]=stored.split(':');if(kind!=='scrypt'||!salt||!hash)return false;const a=Buffer.from(hash,'hex');const b=scryptSync(password,salt,64);return a.length===b.length&&timingSafeEqual(a,b)}
const credentials=z.object({email:z.string().email().max(254),password:z.string().min(8).max(128)});
const aiRewriteSchema=z.object({
 text:z.string().min(1).max(12000),
 action:z.enum(['CORRECT','RHYME','SINGABLE','POWERFUL','SHORTEN','LENGTHEN','ADAPT_STYLE','REWRITE','FULL_SONG']),
 style:z.string().min(1).max(200).default('Pop')
});

app.get('/health',(_req,res)=>res.json({ok:true,service:'melodica-api',version:'1.5.1'}));
app.get('/privacy',(_req,res)=>{
 const controller=process.env.PRIVACY_CONTROLLER_NAME??'MELODICA IA';
 const address=process.env.PRIVACY_CONTROLLER_ADDRESS??'';
 const privacyEmail=process.env.PRIVACY_CONTACT_EMAIL??process.env.SUPPORT_EMAIL??'';
 const updated=process.env.PRIVACY_UPDATED_DATE??'';
 const legalBasis=process.env.PRIVACY_LEGAL_BASIS??'';
 const retention=process.env.PRIVACY_RETENTION??'';
 const providers=process.env.PRIVACY_PROVIDERS??'';
 const authority=process.env.PRIVACY_AUTHORITY??'';
 const deletionUrl=`${process.env.PUBLIC_BASE_URL??''}/account-deletion`;

 res.type('html').send(`<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MELODICA IA — Privacy Policy</title><style>body{font-family:system-ui,sans-serif;max-width:850px;margin:40px auto;padding:0 20px;line-height:1.6;color:#202124}h1,h2{line-height:1.25}a{color:#5b35d5}</style></head><body><h1>MELODICA IA — Privacy Policy</h1><p><strong>Titolare:</strong> ${controller}</p><p><strong>Indirizzo:</strong> ${address}</p><p><strong>Email privacy:</strong> ${privacyEmail}</p><p><strong>Data di aggiornamento:</strong> ${updated}</p><h2>Dati trattati</h2><p>MELODICA IA tratta l'indirizzo email e le credenziali protette dell'account, i progetti, i testi e prompt inseriti, gli asset generati, i dati relativi agli acquisti e i dati tecnici necessari alla sicurezza e al funzionamento del servizio.</p><h2>Finalità</h2><p>I dati sono utilizzati per autenticazione, sincronizzazione dei progetti, generazione e consegna degli asset, gestione dei crediti, assistenza, prevenzione degli abusi e adempimenti contabili.</p><h2>Fornitori e servizi</h2><p>${providers}</p><h2>Base giuridica</h2><p>${legalBasis}</p><h2>Conservazione e sicurezza</h2><p>${retention}</p><p>Le credenziali sono conservate tramite password hash; le chiavi e i token dei provider restano lato server e non vengono inseriti nell'app.</p><h2>Diritti e cancellazione</h2><p>L'utente può richiedere accesso, rettifica o cancellazione dei dati. La cancellazione dell'account può essere effettuata dall'app tramite la funzione <strong>Elimina account e dati</strong> oppure tramite la pagina pubblica:</p><p><a href="${deletionUrl}">${deletionUrl}</a></p><h2>Contatti e reclami</h2><p>Per richieste relative alla privacy: ${privacyEmail}</p><p>${authority}</p><h2>Google Play Data safety</h2><p>Le informazioni sulla sicurezza dei dati sono mantenute coerenti con il comportamento effettivo dell'app e dei servizi utilizzati.</p></body></html>`);
});

app.get('/account-deletion',(_req,res)=>{
 const support=process.env.SUPPORT_EMAIL??process.env.PRIVACY_CONTACT_EMAIL??'';
 const privacyEmail=process.env.PRIVACY_CONTACT_EMAIL??support;
 const deadline=process.env.ACCOUNT_DELETION_TERM??'';
 const mailto=support?`mailto:${support}?subject=Richiesta%20eliminazione%20account%20MELODICA%20IA`:'#';

 res.type('html').send(`<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MELODICA IA — Eliminazione account</title><style>body{font-family:system-ui,sans-serif;max-width:850px;margin:40px auto;padding:0 20px;line-height:1.6;color:#202124}a{color:#5b35d5}.box{padding:18px;border:1px solid #ddd;border-radius:12px}</style></head><body><h1>Eliminazione account MELODICA IA</h1><div class="box"><p>Puoi eliminare il tuo account direttamente dall'app utilizzando <strong>Elimina account e dati</strong>.</p><p>In alternativa, se non puoi accedere all'app, puoi richiedere la cancellazione all'indirizzo <a href="${mailto}">${support}</a>, indicando l'indirizzo email dell'account e seguendo le eventuali procedure di verifica necessarie per tutelare il titolare dell'account.</p><p>La cancellazione dell'account elimina i dati associati presenti nel servizio, inclusi account, progetti, job e saldo crediti, salvo i dati che devono essere conservati per obbligo di legge.</p><p><strong>Tempo di gestione:</strong> ${deadline}</p><p>Per domande sulla privacy: ${privacyEmail}</p></div></body></html>`);
});
app.post('/v1/ai/rewrite',auth,async(req:Req,res)=>{
 const p=aiRewriteSchema.safeParse(req.body);
 if(!p.success)return res.status(400).json({error:'INVALID_AI_REQUEST',details:p.error.flatten()});

 const apiKey=process.env.OPENAI_API_KEY;
 if(!apiKey)return res.status(503).json({error:'AI_TEXT_PROVIDER_NOT_CONFIGURED'});
 if(!openAiModel)return res.status(503).json({error:'AI_TEXT_MODEL_NOT_CONFIGURED'});

 const instructions:Record<string,string>={
  CORRECT:'Correggi grammatica, ortografia e punteggiatura mantenendo il significato e lo stile personale.',
  RHYME:'Migliora le rime e gli incastri mantenendo il significato, evitando rime banali o ripetitive.',
  SINGABLE:'Rendi il testo più cantabile, fluido e naturale, con frasi adatte a essere cantate.',
  POWERFUL:'Rendi il testo più potente, incisivo ed emozionante mantenendo il messaggio originale.',
  SHORTEN:'Accorcia il testo mantenendo il messaggio, le parti più importanti e le immagini migliori.',
  LENGTHEN:'Allunga il testo aggiungendo contenuto coerente senza riempitivi o ripetizioni inutili.',
  ADAPT_STYLE:'Adatta il testo allo stile musicale indicato, mantenendo il significato e rendendolo coerente con quel genere.',
  REWRITE:'Riscrivi il testo in modo creativo mantenendo il tema e il messaggio principale.',
  FULL_SONG:'Trasforma l\'idea o il testo fornito in un brano musicale completo e originale. Sviluppa il tema senza limitarti a correggere o parafrasare il testo iniziale. Crea una struttura professionale con [Intro], [Strofa 1], [Pre-Chorus], [Ritornello], [Strofa 2], [Pre-Chorus], [Ritornello], [Bridge], [Ritornello Finale] e [Outro]. Il brano deve essere abbastanza lungo da poter essere utilizzato come testo completo per una canzone. Mantieni il significato dell\'idea originale e adatta lessico, metrica, immagini e atmosfera allo stile musicale richiesto.'
 };

 const instruction=instructions[p.data.action];
 const system=[
  'Sei un autore musicale professionale e un editor di testi.',
  'Lavora esclusivamente sul testo fornito dall’utente.',
  'Non aggiungere spiegazioni, introduzioni, virgolette o commenti.',
  'Restituisci esclusivamente il testo musicale elaborato.',
  'Quando l\'operazione è FULL_SONG, produci un brano completo e sostanzioso, non una semplice revisione della frase ricevuta.',
  `Operazione richiesta: ${instruction}`,
  `Stile musicale richiesto: ${p.data.style}`
 ].join('\n');

 try{
  const response=await fetch('https://api.openai.com/v1/responses',{
   method:'POST',
   headers:{
    'Authorization':`Bearer ${apiKey}`,
    'Content-Type':'application/json'
   },
   body:JSON.stringify({
    model:openAiModel,
    input:[
     {role:'system',content:system},
     {role:'user',content:p.data.text}
    ],
    max_output_tokens:4000
   })
  });

  const raw=await response.text();
  if(!response.ok)return res.status(502).json({error:'AI_TEXT_PROVIDER_ERROR',status:response.status});

  const data:any=JSON.parse(raw);
  const text=typeof data.output_text==='string'
   ? data.output_text.trim()
   : Array.isArray(data.output)
     ? data.output.flatMap((item:any)=>Array.isArray(item.content)?item.content:[]).map((c:any)=>c.text??'').join('').trim()
     : '';

  if(!text)return res.status(502).json({error:'AI_EMPTY_RESPONSE'});
  return res.json({text});
 }catch{
  return res.status(502).json({error:'AI_TEXT_REQUEST_FAILED'});
 }
});
app.post('/v1/auth/register',async(req,res)=>{const p=credentials.safeParse(req.body);if(!p.success)return res.status(400).json({error:'INVALID_REQUEST'});if(!pool)return res.status(503).json({error:'DATABASE_NOT_CONFIGURED'});try{const r=await pool.query('INSERT INTO users(email,password_hash) VALUES($1,$2) RETURNING id,email',[p.data.email.toLowerCase(),hashPassword(p.data.password)]);const id=r.rows[0].id;await pool.query('INSERT INTO credit_accounts(user_id,balance) VALUES($1,$2) ON CONFLICT DO NOTHING',[id,Number(process.env.NEW_USER_CREDITS??500)]);return res.status(201).json({token:sign(id),user:{id,email:r.rows[0].email}})}catch(e:any){if(e.code==='23505')return res.status(409).json({error:'EMAIL_ALREADY_EXISTS'});return res.status(500).json({error:'REGISTER_FAILED'})}});
app.post('/v1/auth/login',async(req,res)=>{const p=credentials.safeParse(req.body);if(!p.success)return res.status(400).json({error:'INVALID_REQUEST'});if(!pool)return res.status(503).json({error:'DATABASE_NOT_CONFIGURED'});const r=await pool.query('SELECT id,email,password_hash FROM users WHERE email=$1',[p.data.email.toLowerCase()]);if(!r.rowCount||!verifyPassword(p.data.password,r.rows[0].password_hash))return res.status(401).json({error:'INVALID_CREDENTIALS'});return res.json({token:sign(r.rows[0].id),user:{id:r.rows[0].id,email:r.rows[0].email}})});
app.get('/v1/me',auth,async(req:Req,res)=>{if(!pool)return res.status(503).json({error:'DATABASE_NOT_CONFIGURED'});const r=await pool.query('SELECT id,email,created_at FROM users WHERE id=$1',[req.userId]);if(!r.rowCount)return res.status(404).json({error:'USER_NOT_FOUND'});res.json({user:r.rows[0]})});
app.delete('/v1/account',auth,async(req:Req,res)=>{
 if(!pool)return res.status(503).json({error:'DATABASE_NOT_CONFIGURED'});

 const c=await pool.connect();
 let jobIds:string[]=[];
 let consentIds:string[]=[];

 try{
  await c.query('BEGIN');

  const user=await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[req.userId]);
  if(!user.rowCount){
   await c.query('ROLLBACK');
   return res.status(404).json({error:'USER_NOT_FOUND'});
  }

  const jobs=await c.query('SELECT id FROM jobs WHERE user_id=$1',[req.userId]);
  jobIds=jobs.rows.map((r:any)=>String(r.id));
  const voices=await c.query(`SELECT provider_consent_id FROM voice_profiles WHERE user_id=$1 AND provider_consent_id IS NOT NULL`,[req.userId]);
  consentIds=voices.rows.map((r:any)=>String(r.provider_consent_id)).filter(Boolean);

  await c.query('DELETE FROM users WHERE id=$1',[req.userId]);
  await c.query('COMMIT');
 }catch{
  try{await c.query('ROLLBACK')}catch{}
  return res.status(409).json({error:'ACCOUNT_DELETE_FAILED'});
 }finally{
  c.release();
 }

 await Promise.allSettled(
  jobIds.flatMap(jobId=>[
   unlink(path.join(assetsDir,`${jobId}.wav`)),
   unlink(path.join(assetsDir,`${jobId}.mp3`))
  ])
 );
 await rm(path.join(assetsDir,'voices',String(req.userId)),{recursive:true,force:true}).catch(()=>{});
 if(consentIds.length && process.env.SOUNDVERSE_API_KEY?.trim()) {
  await Promise.allSettled(consentIds.map(id=>soundverseRevokeVoiceConsent(id)));
 }

 res.status(204).end();
});
app.get('/v1/credits',auth,async(req:Req,res)=>{if(!pool)return res.status(503).json({error:'DATABASE_NOT_CONFIGURED'});const r=await pool.query('SELECT balance,reserved FROM credit_accounts WHERE user_id=$1',[req.userId]);res.json(r.rows[0]??{balance:0,reserved:0})});
app.get('/v1/credits/catalog',(_req,res)=>res.json(CREDIT_COSTS));
const purchaseSchema=z.object({productId:z.enum(['credits_500','credits_1500','credits_5000']),purchaseToken:z.string().min(16).max(4096)});
app.post('/v1/billing/verify',auth,async(req:Req,res)=>{
 const p=purchaseSchema.safeParse(req.body);
 if(!p.success)return res.status(400).json({error:'INVALID_PURCHASE_REQUEST'});
 if(!pool)return res.status(503).json({error:'DATABASE_NOT_CONFIGURED'});
 if(!process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON) {
  return res.status(503).json({error:'PLAY_SERVICE_ACCOUNT_NOT_CONFIGURED'});
 }

 try {
  const verified=await verifyGooglePlayPurchase(
   p.data.productId,
   p.data.purchaseToken
  );

  if(!verified.verified) {
   return res.status(402).json({error:verified.reason});
  }

  const result=await grantVerifiedPurchase(
   pool,
   req.userId!,
   p.data.productId,
   p.data.purchaseToken
  );

  const publisher=getGooglePlayPublisher();

  if(verified.consumptionState !== 1) {
   try {
    await publisher.purchases.products.consume({
     packageName:GOOGLE_PLAY_PACKAGE_NAME,
     productId:p.data.productId,
     token:p.data.purchaseToken
    });
   } catch {
    return res.status(502).json({
     error:'PURCHASE_CONSUME_FAILED',
     verified:true,
     ...result
    });
   }
  }

  return res.json({
   verified:true,
   ...result
  });
 } catch(e) {
  const message=e instanceof Error ? e.message : '';
  if(message.includes('NOT_CONFIGURED')) {
   return res.status(503).json({error:'PLAY_SERVICE_ACCOUNT_NOT_CONFIGURED'});
  }
  if(message.includes('INVALID')) {
   return res.status(500).json({error:'PLAY_SERVICE_ACCOUNT_INVALID'});
  }
  return res.status(502).json({error:'PURCHASE_VERIFICATION_FAILED'});
 }
});
const projectSchema=z.object({title:z.string().trim().min(1).max(120),style:z.string().trim().max(80).default('Pop'),lyrics:z.string().max(20000).default('')});
const projectPatchSchema=z.object({title:z.string().trim().min(1).max(120).optional(),style:z.string().trim().max(120).optional(),lyrics:z.string().max(20000).optional()}).refine(v=>Object.keys(v).length>0);
app.get('/v1/projects',auth,async(req:Req,res)=>{if(!pool)return res.status(503).json({error:'DATABASE_NOT_CONFIGURED'});const r=await pool.query(`SELECT id,title,style,COALESCE(lyrics,'') AS lyrics,created_at,updated_at FROM projects WHERE user_id=$1 ORDER BY updated_at DESC`,[req.userId]);res.json(r.rows)});
app.post('/v1/projects',auth,async(req:Req,res)=>{const p=projectSchema.safeParse(req.body);if(!p.success)return res.status(400).json({error:'INVALID_REQUEST'});if(!pool)return res.status(503).json({error:'DATABASE_NOT_CONFIGURED'});const r=await pool.query('INSERT INTO projects(user_id,title,style,lyrics) VALUES($1,$2,$3,$4) RETURNING *',[req.userId,p.data.title,p.data.style,p.data.lyrics]);res.status(201).json(r.rows[0])});
app.patch('/v1/projects/:id',auth,async(req:Req,res)=>{const p=projectPatchSchema.safeParse(req.body);if(!p.success)return res.status(400).json({error:'INVALID_REQUEST'});if(!pool)return res.status(503).json({error:'DATABASE_NOT_CONFIGURED'});const r=await pool.query(`UPDATE projects SET title=COALESCE($3,title),style=COALESCE($4,style),lyrics=COALESCE($5,lyrics),updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING id,title,style,lyrics,created_at,updated_at`,[req.params.id,req.userId,p.data.title??null,p.data.style??null,p.data.lyrics??null]);if(!r.rowCount)return res.status(404).json({error:'PROJECT_NOT_FOUND'});res.json(r.rows[0])});
app.delete('/v1/projects/:id',auth,async(req:Req,res)=>{if(!pool)return res.status(503).json({error:'DATABASE_NOT_CONFIGURED'});const r=await pool.query('DELETE FROM projects WHERE id=$1 AND user_id=$2',[req.params.id,req.userId]);if(!r.rowCount)return res.status(404).json({error:'PROJECT_NOT_FOUND'});res.status(204).end()});

const generationSchema=z.object({projectId:z.string().uuid(),mode:z.string().min(1).max(40),prompt:z.string().max(4000),idempotencyKey:z.string().min(8).max(128),voiceId:z.string().max(200).nullable().optional()});
function makeWav(seconds=8){const rate=44100,channels=1,bits=16,samples=rate*seconds;const data=Buffer.alloc(samples*2);const notes=[261.63,329.63,392,523.25,392,329.63,293.66,349.23];for(let i=0;i<samples;i++){const t=i/rate;const n=notes[Math.floor(t*2)%notes.length];const env=Math.min(1,t*10)*Math.min(1,(seconds-t)*10);const v=Math.sin(2*Math.PI*n*t)*0.22*env;data.writeInt16LE(Math.max(-1,Math.min(1,v))*32767,i*2)}const h=Buffer.alloc(44);h.write('RIFF',0);h.writeUInt32LE(36+data.length,4);h.write('WAVE',8);h.write('fmt ',12);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(channels,22);h.writeUInt32LE(rate,24);h.writeUInt32LE(rate*2,28);h.writeUInt16LE(2,32);h.writeUInt16LE(bits,34);h.write('data',36);h.writeUInt32LE(data.length,40);return Buffer.concat([h,data])}
async function finalizeJob(pool: Pool, jobId: string, outcome: 'SUCCEEDED'|'FAILED', errorMessage?: string, actualAmount?: number) {
 const c=await pool.connect();
 try {
  await c.query('BEGIN');
  const r=await c.query('SELECT * FROM jobs WHERE id=$1 FOR UPDATE',[jobId]);
  if(!r.rowCount){await c.query('ROLLBACK'); return false;}
  const j=r.rows[0];
  if(j.status!=='RUNNING') { await c.query('ROLLBACK'); return false; }
  if(outcome==='SUCCEEDED') {
   await settleCreditsTx(c,j.user_id,j.reserved_credits,actualAmount ?? j.reserved_credits,jobId);
   await c.query("UPDATE jobs SET status='SUCCEEDED',settled_credits=$2,completed_at=now(),updated_at=now() WHERE id=$1",[jobId,actualAmount ?? j.reserved_credits]);
  } else {
   await settleCreditsTx(c,j.user_id,j.reserved_credits,0,`fail-${jobId}`);
   await c.query("UPDATE jobs SET status='FAILED',error=$2,completed_at=now(),updated_at=now() WHERE id=$1",[jobId,String(errorMessage??'GENERATION_FAILED').slice(0,500)]);
  }
  await c.query('COMMIT'); return true;
 } catch(e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}

async function runJob(jobId:string){
 if(!pool)return;
 const claim=await pool.query(
  "UPDATE jobs SET status='RUNNING',updated_at=now() WHERE id=$1 AND status='QUEUED' RETURNING *",
  [jobId]
 );
 if(!claim.rowCount)return;
 const j=claim.rows[0];

 try{
  let assetPath:string|undefined;

  const project=await pool.query(
   `SELECT title,style,lyrics
    FROM projects
    WHERE id=$1 AND user_id=$2`,
   [j.project_id,j.user_id]
  );
  if(!project.rowCount)throw new Error('PROJECT_NOT_FOUND');

  const style=String(project.rows[0].style??'Pop').trim();
  const lyrics=String(project.rows[0].lyrics??'').trim();
  const generationPrompt=[style,String(j.prompt??'').trim()].filter(Boolean).join(', ').slice(0,2000);

  if(j.voice_id){
   const voice=await pool.query(
    `SELECT provider,audio_path,provider_voice_id,provider_task_id,provider_status
     FROM voice_profiles
     WHERE id=$1 AND user_id=$2`,
    [j.voice_id,j.user_id]
   );
   if(!voice.rowCount)throw new Error('VOICE_NOT_FOUND');
   const v=voice.rows[0];

   const useReplicatePersonalVoice =
    v.provider==='replicate' ||
    ((!v.provider || String(v.provider)==='null') && replicateConfigured());

   if(useReplicatePersonalVoice){
    if(!replicateConfigured())throw new Error('REPLICATE_API_TOKEN_NOT_CONFIGURED');
    if(!['READY','LOCAL'].includes(String(v.provider_status??'')))
     throw new Error(`VOICE_NOT_READY:${v.provider_status??'UNKNOWN'}`);
    const referencePath=String(v.audio_path??'');
    if(v.provider!=='replicate'){
     await pool.query(
      `UPDATE voice_profiles
       SET provider='replicate',provider_file_id=NULL,provider_voice_id=NULL,
           provider_task_id=NULL,provider_consent_id=NULL,provider_status='READY',updated_at=now()
       WHERE id=$1 AND user_id=$2`,
      [j.voice_id,j.user_id]
     );
    }
    if(!referencePath)throw new Error('VOICE_REFERENCE_MISSING');

    const basePath=path.join(assetsDir,`${jobId}.base.mp3`);
    const finalPath=path.join(assetsDir,`${jobId}.wav`);
    try{
     await generateAiSong({lyrics,prompt:generationPrompt,outputPath:basePath});
     await cloneVoice({sourceAudioPath:basePath,referenceAudioPath:referencePath,outputPath:finalPath});
     assetPath=`${jobId}.wav`;
    }finally{
     await unlink(basePath).catch(()=>{});
    }
   } else if(v.provider==='soundverse'){
    if(!process.env.SOUNDVERSE_API_KEY?.trim()){
     throw new Error('SOUNDVERSE_API_KEY_NOT_CONFIGURED');
    }
    if(v.provider_status!=='READY' || !v.provider_voice_id){
     throw new Error(`VOICE_NOT_READY:${v.provider_status??'UNKNOWN'}`);
    }

    const generated=await soundverseGenerateSong({
     lyrics:lyrics.slice(0,3000),
     style:style.slice(0,1024),
     vocalId:String(v.provider_voice_id),
     idempotencyKey:`melodica-song-${jobId}`
    });

    const taskId=String(
     generated.task_id ??
     generated.job_id ??
     generated.taskId ??
     generated.id ??
     ''
    );
    if(!taskId)throw new Error(`SOUNDVERSE_TASK_ID_MISSING:${JSON.stringify(generated)}`);

    let completed:any=null;
    for(let attempt=0;attempt<180;attempt++){
     await new Promise(r=>setTimeout(r,2000));
     const status=await soundverseGetGeneration(taskId);
     const state=String(status.status??status.state??'').toLowerCase();
     if(['failed','error','canceled','cancelled'].includes(state)){
      throw new Error(`SOUNDVERSE_GENERATION_${state.toUpperCase()}`);
     }
     if(['completed','succeeded','success'].includes(state)){
      completed=status;
      break;
     }
    }
    if(!completed)throw new Error('SOUNDVERSE_GENERATION_TIMEOUT');

    const assets=Array.isArray(completed?.output?.assets)?completed.output.assets:[];
    const fileId=String(
     assets[0]?.file_id ?? assets[0]?.fileId ??
     completed?.output?.file_id ?? completed?.output?.fileId ?? ''
    );
    if(!fileId)throw new Error(`SOUNDVERSE_OUTPUT_FILE_MISSING:${JSON.stringify(completed)}`);
    const audio=await soundverseDownloadFile(fileId);
    const filename=`${jobId}.mp3`;
    await writeFile(path.join(assetsDir,filename),audio);
    assetPath=filename;
   } else {
    throw new Error(`VOICE_PROVIDER_UNSUPPORTED:${v.provider??'LOCAL'}`);
   }

  } else if(replicateConfigured()){
   const filename=`${jobId}.mp3`;
   await generateAiSong({
    lyrics,
    prompt:generationPrompt,
    outputPath:path.join(assetsDir,filename)
   });
   assetPath=filename;

  } else if(process.env.STABILITY_API_KEY){
   const form=new FormData();
   form.append('prompt',j.prompt);
   form.append('model','stable-audio-2.5');
   form.append('duration','30');
   form.append('output_format','wav');

   const audio=await fetch(
    'https://api.stability.ai/v2beta/audio/stable-audio-2/text-to-audio',
    {
     method:'POST',
     headers:{
      'Authorization':`Bearer ${process.env.STABILITY_API_KEY}`,
      'Accept':'audio/*'
     },
     body:form
    }
   );
   if(!audio.ok)throw new Error(`STABILITY_HTTP_${audio.status}:${await audio.text()}`);
   const filename=`${jobId}.wav`;
   await writeFile(path.join(assetsDir,filename),Buffer.from(await audio.arrayBuffer()));
   assetPath=filename;

  } else if(providerGateway){
   const resp=await fetch(
    `${providerGateway}/v1/generations`,
    {
     method:'POST',
     headers:{
      'content-type':'application/json',
      ...(providerKey?{'authorization':`Bearer ${providerKey}`}: {})
     },
     body:JSON.stringify({mode:j.mode,prompt:j.prompt,jobId:j.id})
    }
   );
   if(!resp.ok)throw new Error(`PROVIDER_HTTP_${resp.status}`);
   const data:any=await resp.json();
   if(data.assetPath)assetPath=String(data.assetPath);
   else if(data.assetUrl)assetPath=String(data.assetUrl);
   else throw new Error('PROVIDER_RESPONSE_MISSING_ASSET');

  } else if(process.env.ALLOW_LOCAL_DEMO==='true' && !j.mode.toLowerCase().includes('video')){
   const filename=`${jobId}.wav`;
   await writeFile(path.join(assetsDir,filename),makeWav(8));
   assetPath=filename;

  } else {
   throw new Error('AI_PROVIDER_NOT_CONFIGURED');
  }

  const base=process.env.PUBLIC_BASE_URL??`http://localhost:${process.env.PORT??8080}`;
  const assetUrl=assetPath.startsWith('http')
   ? assetPath
   : `${base}/v1/assets/${jobId}`;

  const saved=await pool.query(
   "UPDATE jobs SET asset_url=$2,updated_at=now() WHERE id=$1 AND status='RUNNING' RETURNING id",
   [jobId,assetUrl]
  );

  if(!saved.rowCount){
   if(!assetPath.startsWith('http')){
    await unlink(path.join(assetsDir,assetPath)).catch(()=>{});
   }
   return;
  }

  await finalizeJob(pool,jobId,'SUCCEEDED',undefined,j.reserved_credits);

 }catch(e:any){
  try{
   await finalizeJob(
    pool,
    jobId,
    'FAILED',
    e?.message??'GENERATION_FAILED'
   );
  }catch{
   /* preserve job state for operational retry */
  }
 }
}
app.post('/v1/voices/:voiceId/audio',auth,async(req:Req,res)=>{
 if(!pool)return res.status(503).json({error:'DATABASE_NOT_CONFIGURED'});
 const voiceId=String(req.params.voiceId??'');
 if(!/^[0-9a-fA-F-]{20,200}$/.test(voiceId))return res.status(400).json({error:'INVALID_VOICE_ID'});
 const contentType=req.header('content-type')??'';
 if(!contentType.startsWith('audio/'))return res.status(415).json({error:'AUDIO_REQUIRED'});

 const consent=req.header('x-voice-consent')?.trim().toLowerCase();
 if(consent!=='true')return res.status(400).json({error:'VOICE_CONSENT_REQUIRED'});

 const userDir=path.join(assetsDir,'voices',String(req.userId));
 await mkdir(userDir,{recursive:true});

 const extension=contentType.includes('mp4')||contentType.includes('m4a')?'m4a':'wav';
 const filename=`${voiceId}.${extension}`;
 const filePath=path.join(userDir,filename);
 const chunks:Buffer[]=[];
 let total=0;

 try{
  for await(const chunk of req){
   const b=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);
   total+=b.length;
   if(total>15*1024*1024)return res.status(413).json({error:'VOICE_FILE_TOO_LARGE'});
   chunks.push(b);
  }

  if(total<1024)return res.status(400).json({error:'VOICE_FILE_EMPTY'});

  const audio=Buffer.concat(chunks);
  const header=audio.subarray(0,16);
  const isWav=header.length>=12 && header.subarray(0,4).toString('ascii')==='RIFF' && header.subarray(8,12).toString('ascii')==='WAVE';
  const isMp4=header.length>=12 && header.subarray(4,8).toString('ascii')==='ftyp';
  const isOgg=header.subarray(0,4).toString('ascii')==='OggS';
  const isMp3=header.subarray(0,3).toString('ascii')==='ID3' || (header.length>=2 && header[0]===0xff && (header[1]&0xe0)===0xe0);
  if(!isWav && !isMp4 && !isOgg && !isMp3)return res.status(415).json({error:'UNSUPPORTED_AUDIO_FORMAT'});
  const safeTitle=(req.header('x-voice-title')?.trim()||`Voce ${voiceId.slice(0,8)}`).slice(0,120);
  await writeFile(filePath,audio);

  const title=safeTitle;

  await pool.query(
   `INSERT INTO voice_profiles(id,user_id,title,audio_path,provider_status)
    VALUES($1,$2,$3,$4,'LOCAL')
    ON CONFLICT(id) DO UPDATE SET
      title=EXCLUDED.title,
      audio_path=EXCLUDED.audio_path,
      updated_at=now()`,
   [voiceId,req.userId,title,filePath]
  );

  if(replicateConfigured()){
   await pool.query(
    `UPDATE voice_profiles
     SET provider='replicate',provider_file_id=NULL,provider_voice_id=NULL,
         provider_task_id=NULL,provider_consent_id=NULL,
         provider_status='READY',updated_at=now()
     WHERE id=$1 AND user_id=$2`,
    [voiceId,req.userId]
   );
   return res.status(201).json({
    voiceId,
    size:total,
    status:'UPLOADED',
    provider:'replicate',
    providerStatus:'READY'
   });
  }

  /*
   * No provider token: keep the reference locally. This is intentionally
   * not sent to Soundverse automatically, so a new MELODICA voice cannot
   * incur provider charges just because it was registered.
   */
  await pool.query(
   `UPDATE voice_profiles
    SET provider=NULL,provider_file_id=NULL,provider_voice_id=NULL,
        provider_task_id=NULL,provider_consent_id=NULL,
        provider_status='LOCAL',updated_at=now()
    WHERE id=$1 AND user_id=$2`,
   [voiceId,req.userId]
  );
  return res.status(201).json({
   voiceId,
   size:total,
   status:'UPLOADED',
   providerStatus:'LOCAL'
  });
 }catch(e:any){
  console.error('VOICE_UPLOAD_FAILED', e?.message ?? e);
  try{await unlink(filePath)}catch{}
  try{await pool.query('DELETE FROM voice_profiles WHERE id=$1 AND user_id=$2',[voiceId,req.userId])}catch{}
  return res.status(500).json({ error:'VOICE_UPLOAD_FAILED' });
 }
});


app.get('/v1/voices/:voiceId/status',auth,async(req:Req,res)=>{
 if(!pool)return res.status(503).json({error:'DATABASE_NOT_CONFIGURED'});
 const voiceId=String(req.params.voiceId??'');
 if(!/^[0-9a-fA-F-]{20,200}$/.test(voiceId))return res.status(400).json({error:'INVALID_VOICE_ID'});
 try{
  const r=await pool.query(
   `SELECT id,title,provider,provider_voice_id,provider_task_id,provider_status
    FROM voice_profiles WHERE id=$1 AND user_id=$2`,
   [voiceId,req.userId]
  );
  if(!r.rowCount)return res.status(404).json({error:'VOICE_NOT_FOUND'});
  const voice=r.rows[0];

  if(voice.provider==='soundverse' && voice.provider_task_id && !voice.provider_voice_id &&
     ['CLONING','SUBMITTED'].includes(String(voice.provider_status))){
   try{
    const sv=await soundverseGetGeneration(String(voice.provider_task_id));
    const metadata=sv?.output?.metadata_json ?? sv?.metadata_json ?? sv?.output?.metadata ?? {};
    let meta:any=metadata;
    if(typeof meta==='string'){try{meta=JSON.parse(meta)}catch{}}

    const providerVoiceId=String(
     sv?.output?.vocal_id ?? sv?.output?.vocalId ??
     meta?.vocal_id ?? meta?.vocalId ??
     meta?.voice_id ?? meta?.voiceId ?? ''
    );

    const status=String(sv?.status ?? sv?.state ?? '').toUpperCase();

    if(providerVoiceId.startsWith('sv_voice_')){
     await pool.query(
      `UPDATE voice_profiles
       SET provider_voice_id=$1,provider_status='READY',updated_at=now()
       WHERE id=$2 AND user_id=$3`,
      [providerVoiceId,voiceId,req.userId]
     );
     voice.provider_voice_id=providerVoiceId;
     voice.provider_status='READY';
    }else if(['FAILED','ERROR','CANCELED','CANCELLED'].includes(status)){
     await pool.query(
      `UPDATE voice_profiles
       SET provider_status='FAILED',updated_at=now()
       WHERE id=$1 AND user_id=$2`,
      [voiceId,req.userId]
     );
     voice.provider_status='FAILED';
    }
   }catch{}
  }

  return res.json({
   voiceId:voice.id,
   title:voice.title,
   provider:voice.provider,
   providerVoiceId:voice.provider_voice_id,
   providerTaskId:voice.provider_task_id,
   providerStatus:voice.provider_status
  });
 }catch{
  return res.status(500).json({error:'VOICE_STATUS_FAILED'});
 }
});

app.post('/v1/generations',auth,async(req:Req,res)=>{const p=generationSchema.safeParse(req.body);if(!p.success)return res.status(400).json({error:'INVALID_REQUEST',details:p.error.flatten()});if(!pool)return res.status(503).json({error:'DATABASE_NOT_CONFIGURED'});const cost=(CREDIT_COSTS as Record<string,number>)[p.data.mode];if(!cost)return res.status(400).json({error:'UNKNOWN_GENERATION_MODE'});try{const c=await pool.connect();let jobRow:any;try{await c.query('BEGIN');const project=await c.query('SELECT id FROM projects WHERE id=$1 AND user_id=$2 FOR SHARE',[p.data.projectId,req.userId]);if(!project.rowCount){await c.query('ROLLBACK');return res.status(404).json({error:'PROJECT_NOT_FOUND'});}const prior=await c.query('SELECT id,status,reserved_credits FROM jobs WHERE user_id=$1 AND idempotency_key=$2 FOR SHARE',[req.userId,p.data.idempotencyKey]);if(prior.rowCount){await c.query('COMMIT');const existing=prior.rows[0];return res.status(200).json({id:existing.id,status:existing.status,progress:['SUCCEEDED','FAILED','CANCELED'].includes(existing.status)?100:5,reservedCredits:existing.reserved_credits});}await reserveCreditsTx(c,req.userId!,cost,p.data.idempotencyKey);const job=await c.query(`INSERT INTO jobs(user_id,project_id,mode,prompt,status,reserved_credits,idempotency_key,voice_id) VALUES($1,$2,$3,$4,'QUEUED',$5,$6,$7) RETURNING id,status,reserved_credits`,[req.userId,p.data.projectId,p.data.mode,p.data.prompt,cost,p.data.idempotencyKey,p.data.voiceId??null]);jobRow=job.rows[0];await c.query('COMMIT');}catch(e){try{await c.query('ROLLBACK')}catch{};throw e}finally{c.release()}res.status(202).json({id:jobRow.id,status:jobRow.status,progress:0,reservedCredits:jobRow.reserved_credits});setImmediate(()=>runJob(jobRow.id))}catch(e:any){if(e?.message==='INSUFFICIENT_CREDITS')return res.status(402).json({error:'INSUFFICIENT_CREDITS'});res.status(409).json({error:'GENERATION_CREATE_FAILED'})}});
app.get('/v1/generations/:id',auth,async(req:Req,res)=>{if(!pool)return res.status(503).json({error:'DATABASE_NOT_CONFIGURED'});const r=await pool.query(`SELECT id,status,asset_url AS "assetUrl",error,CASE status WHEN 'QUEUED' THEN 5 WHEN 'RUNNING' THEN 65 WHEN 'SUCCEEDED' THEN 100 WHEN 'FAILED' THEN 100 ELSE 0 END AS progress FROM jobs WHERE id=$1 AND user_id=$2`,[req.params.id,req.userId]);if(!r.rowCount)return res.status(404).json({error:'JOB_NOT_FOUND'});res.json(r.rows[0])});

app.get('/v1/assets/:jobId',auth,async(req:Req,res)=>{
 if(!pool)return res.status(503).json({error:'DATABASE_NOT_CONFIGURED'});
 const r=await pool.query('SELECT asset_url FROM jobs WHERE id=$1 AND user_id=$2 AND status=\'SUCCEEDED\'', [req.params.jobId,req.userId]);
 if(!r.rowCount)return res.status(404).json({error:'ASSET_NOT_FOUND'});

 const raw=String(r.rows[0].asset_url??'');
 const base=(process.env.PUBLIC_BASE_URL??`http://localhost:${process.env.PORT??8080}`).replace(/\/$/,'');
 const internalPrefix=`${base}/v1/assets/`;

 if(/^https?:\/\//i.test(raw) && !raw.startsWith(internalPrefix)){
  return res.redirect(302,raw);
 }

 const mp3=`${req.params.jobId}.mp3`;
 const wav=`${req.params.jobId}.wav`;
 const filename=existsSync(path.join(assetsDir,mp3))?mp3:wav;

 const file=path.join(assetsDir,filename);
 if(!existsSync(file)||!filename||filename!==path.basename(filename))
  return res.status(404).json({error:'ASSET_FILE_NOT_FOUND'});

 res.sendFile(file);
});

app.post('/v1/generations/:id/cancel',auth,async(req:Req,res)=>{if(!pool)return res.status(503).json({error:'DATABASE_NOT_CONFIGURED'});const c=await pool.connect();try{await c.query('BEGIN');const r=await c.query(`SELECT id,status,reserved_credits FROM jobs WHERE id=$1 AND user_id=$2 FOR UPDATE`,[req.params.id,req.userId]);if(!r.rowCount||!['QUEUED','RUNNING'].includes(r.rows[0].status)){await c.query('ROLLBACK');return res.status(404).json({error:'JOB_NOT_FOUND_OR_NOT_CANCELABLE'});}await settleCreditsTx(c,req.userId!,r.rows[0].reserved_credits,0,`cancel-${r.rows[0].id}`);await c.query(`UPDATE jobs SET status='CANCELED',updated_at=now(),completed_at=now() WHERE id=$1`,[r.rows[0].id]);await c.query('COMMIT');return res.status(202).json({status:'CANCELED',id:r.rows[0].id});}catch(e){await c.query('ROLLBACK');return res.status(409).json({error:'CANCEL_FAILED'});}finally{c.release();}});

async function recoverJobsOnStartup(){
 if(!pool)return;
 try{
  const stale=await pool.query(`
   SELECT id,status
   FROM jobs
   WHERE status IN ('QUEUED','RUNNING')
     AND updated_at < now() - interval '2 minutes'
   ORDER BY created_at ASC
   LIMIT 100
  `);
  for(const row of stale.rows){
   if(String(row.status)==='RUNNING') await pool.query(`UPDATE jobs SET status='QUEUED',updated_at=now() WHERE id=$1 AND status='RUNNING'`,[row.id]);
   setImmediate(()=>runJob(String(row.id)));
  }
 }catch(err){ console.error('JOB_RECOVERY_FAILED',err); }
}
const port=Number(process.env.PORT??8080);
app.listen(port,()=>{
 console.log(`MELODICA API listening on :${port}`);
 void recoverJobsOnStartup();
});
