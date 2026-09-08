@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.melodica.ai

import android.app.Activity
import android.content.Context
import android.media.MediaPlayer
import android.os.Bundle
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import java.net.HttpURLConnection
import java.net.URL
import kotlin.math.PI
import kotlin.math.sin
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.NavigationBarItem
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import androidx.navigation.compose.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

private const val DEMO_CREDITS = 500

private val generationModes = mapOf(
    "🎵 Genera canzone" to "SONG_GENERATION",
    "📻 Radio Hit" to "AI_MIX",
    "🚀 Club Hit" to "SONG_GENERATION",
    "🎤 Voice Lab" to "VOICE_GENERATION",
    "🎶 Cori & ad-libs" to "VOICE_GENERATION",
    "🔎 Music Scanner" to "AUDIO_ANALYSIS",
    "🧬 Music DNA" to "MUSIC_DNA",
    "🛠️ Remix IA" to "SONG_GENERATION",
    "🎬 Video completo" to "VIDEO_10_HD",
    "👄 Lip Sync" to "VIDEO_5_HD",
    "🎚️ Mastering" to "AI_MASTER"
)

private val featureCatalog = listOf(
    Feature("✨", "Migliora testo IA", "Hook, rime, struttura e riscrittura", 0),
    Feature("🎵", "Genera canzone", "Produzione completa da idea/testo", 150),
    Feature("📻", "Radio Hit", "Mix pop pronto per radio", 30),
    Feature("🚀", "Club Hit", "EDM, dance, drop e build-up", 150),
    Feature("🎤", "Voice Lab", "Voce, variazioni e interpretazione", 75),
    Feature("🎶", "Cori & ad-libs", "Armonie e backing vocals", 75),
    Feature("🔎", "Music Scanner", "BPM, tonalità e struttura", 15),
    Feature("🧬", "Music DNA", "Identità sonora riutilizzabile", 10),
    Feature("🛠️", "Remix IA", "Variazioni, estensioni e stem", 150),
    Feature("🎬", "Video completo", "Storyboard + scene musicali", 500),
    Feature("👄", "Lip Sync", "Sincronizzazione labiale", 250),
    Feature("🎚️", "Mastering", "Master finale e loudness", 50)
)

data class Feature(val emoji: String, val title: String, val subtitle: String, val cost: Int)

data class Project(
    val id: Long,
    val title: String,
    val style: String,
    val status: String = "Bozza",
    val progress: Int = 0,
    val duration: String = "03:24",
    val lyrics: String = "",
    val remoteId: String? = null,
    val assetUrl: String? = null
)

class SessionStore(context: Context) {
    private val prefs = context.getSharedPreferences("melodica_session", Context.MODE_PRIVATE)
    var token: String?
        get() = prefs.getString("token", null)
        set(value) { prefs.edit().apply { if (value == null) remove("token") else putString("token", value) }.apply() }
    var email: String?
        get() = prefs.getString("email", null)
        set(value) { prefs.edit().putString("email", value ?: "").apply() }
}

class LocalStore(private val context: Context) {
    private val prefs = context.getSharedPreferences("melodica_store", Context.MODE_PRIVATE)
    var projects by mutableStateOf(loadProjects()); private set
    var serverCredits by mutableIntStateOf(prefs.getInt("server_credits", 0)); private set
    var isPlaying by mutableStateOf(false); private set
    private var player: MediaPlayer? = null

    private fun loadProjects(): List<Project> = runCatching {
        val a = JSONArray(prefs.getString("projects", "[]"))
        List(a.length()) { i ->
            val o = a.getJSONObject(i)
            Project(o.getLong("id"), o.getString("title"), o.getString("style"), o.optString("status", "Bozza"), o.optInt("progress"), o.optString("duration", "03:24"), o.optString("lyrics", ""), o.optString("remoteId").takeIf { it.isNotBlank() }, o.optString("assetUrl").takeIf { it.isNotBlank() })
        }
    }.getOrDefault(emptyList())

    private fun persist() {
        val a = JSONArray()
        projects.forEach { p ->
            a.put(JSONObject().apply {
                put("id", p.id); put("title", p.title); put("style", p.style); put("status", p.status); put("progress", p.progress); put("duration", p.duration); put("lyrics", p.lyrics)
                if (p.remoteId != null) put("remoteId", p.remoteId)
                if (p.assetUrl != null) put("assetUrl", p.assetUrl)
            })
        }
        prefs.edit().putString("projects", a.toString()).putInt("server_credits", serverCredits).apply()
    }

    fun addProject(title: String, style: String, lyrics: String, remoteId: String?): Project {
        val p = Project(System.currentTimeMillis(), title.ifBlank { "Nuovo progetto" }, style, lyrics = lyrics, remoteId = remoteId)
        projects = listOf(p) + projects; persist(); return p
    }

    fun replaceProjects(remote: List<RemoteProject>) {
        val existingByRemote = projects.filter { it.remoteId != null }.associateBy { it.remoteId }
        projects = remote.map { r ->
            val old = existingByRemote[r.id]
            old?.copy(title = r.title, style = r.style) ?: Project(System.nanoTime(), r.title, r.style, remoteId = r.id)
        }
        persist()
    }

    fun update(id: Long, status: String, progress: Int, assetUrl: String? = null) {
        projects = projects.map { if (it.id == id) it.copy(status = status, progress = progress, assetUrl = assetUrl ?: it.assetUrl) else it }
        persist()
    }

    fun setCredits(value: Int) { serverCredits = value; persist() }

    fun togglePlayback(project: Project, token: String?) {
        if (isPlaying) { player?.stop(); player?.release(); player = null; isPlaying = false; return }
        Thread {
            try {
                val file = File(context.cacheDir, "${project.id}.wav")
                if (project.assetUrl != null) downloadAsset(project.assetUrl, token, file) else if (!file.exists()) createTone(file)
                runOnMain {
                    player = MediaPlayer().apply { setDataSource(file.absolutePath); setOnCompletionListener { this@LocalStore.isPlaying = false; release() }; prepare(); start() }
                    isPlaying = true
                }
            } catch (_: Exception) { runOnMain { isPlaying = false } }
        }.start()
    }

    private fun downloadAsset(assetUrl: String, token: String?, file: File) {
        val conn = (URL(assetUrl).openConnection() as HttpURLConnection)
        conn.connectTimeout = 10_000; conn.readTimeout = 30_000
        token?.let { conn.setRequestProperty("Authorization", "Bearer $it") }
        if (conn.responseCode !in 200..299) error("ASSET_HTTP_${conn.responseCode}")
        conn.inputStream.use { input -> file.outputStream().use { output -> input.copyTo(output) } }
    }

    private fun runOnMain(block: () -> Unit) { android.os.Handler(context.mainLooper).post(block) }

    private fun createTone(file: File) {
        val rate = 44100; val seconds = 8; val samples = rate * seconds; val data = ByteArray(samples * 2)
        val notes = doubleArrayOf(261.63, 329.63, 392.0, 523.25, 392.0, 329.63, 293.66, 349.23)
        for (i in 0 until samples) { val t = i.toDouble() / rate; val n = notes[((t * 2).toInt()) % notes.size]; val env = minOf(1.0, t * 10) * minOf(1.0, (seconds - t) * 10); val v = sin(2 * PI * n * t) * 0.22 * env; val x = (v * 32767).toInt(); data[i * 2] = (x and 255).toByte(); data[i * 2 + 1] = ((x shr 8) and 255).toByte() }
        FileOutputStream(file).use { out ->
            fun w(s: String) { out.write(s.toByteArray(Charsets.US_ASCII)) }; fun i16(v: Int) { out.write(v and 255); out.write((v shr 8) and 255) }; fun i32(v: Int) { out.write(v and 255); out.write((v shr 8) and 255); out.write((v shr 16) and 255); out.write((v shr 24) and 255) }
            w("RIFF"); i32(36 + data.size); w("WAVEfmt "); i32(16); i16(1); i16(1); i32(rate); i32(rate * 2); i16(2); i16(16); w("data"); i32(data.size); out.write(data)
        }
    }
}

class MainActivity : ComponentActivity() {
    private lateinit var session: SessionStore
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        session = SessionStore(this)
        val store = LocalStore(this)
        val api = ApiBackend(BuildConfig.MELODICA_API_BASE_URL, { session.token }, { session.token = it })
        setContent { MelodicaTheme { MelodicaRoot(store, session, api) } }
    }
}

@Composable fun MelodicaTheme(content: @Composable () -> Unit) { MaterialTheme(colorScheme = darkColorScheme(), content = content) }

@Composable fun MelodicaRoot(store: LocalStore, session: SessionStore, api: MelodicaBackend) {
    var loggedIn by remember { mutableStateOf(session.token != null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val billing = remember { BillingManager(context, { productId, purchaseToken -> api.verifyPurchase(productId, purchaseToken) }) { } }

    if (!BuildConfig.MELODICA_API_ENABLED) {
        MelodicaApp(store, api, session, billing, onLogout = {})
        return
    }
    if (!loggedIn) {
        AuthScreen(
            busy = busy,
            error = error,
            onLogin = { email, password ->
                scope.launch {
                    busy = true; error = null
                    try { val user = api.login(email, password); session.email = user.email; store.setCredits(api.getCredits().balance); store.replaceProjects(api.getProjects()); loggedIn = true }
                    catch (t: Throwable) { error = friendlyError(t) }
                    busy = false
                }
            },
            onRegister = { email, password ->
                scope.launch {
                    busy = true; error = null
                    try { val user = api.register(email, password); session.email = user.email; store.setCredits(api.getCredits().balance); store.replaceProjects(api.getProjects()); loggedIn = true }
                    catch (t: Throwable) { error = friendlyError(t) }
                    busy = false
                }
            }
        )
        return
    }
    LaunchedEffect(loggedIn) {
        try { api.me(); store.setCredits(api.getCredits().balance); store.replaceProjects(api.getProjects()); billing.connect() } catch (_: Throwable) { session.token = null; loggedIn = false }
    }
    DisposableEffect(Unit) { onDispose { billing.endConnection() } }
    MelodicaApp(store, api, session, billing, onLogout = { api.logout(); session.email = null; loggedIn = false })
}

private fun friendlyError(t: Throwable): String {
    val m = t.message.orEmpty()
    return when {
        "EMAIL_ALREADY_EXISTS" in m -> "Email già registrata. Prova ad accedere."
        "INVALID_CREDENTIALS" in m -> "Email o password non corretti."
        "API 409" in m -> "Operazione non disponibile per questo account."
        "API 402" in m -> "Crediti insufficienti."
        else -> "Errore di connessione. Controlla internet e riprova."
    }
}

@Composable fun AuthScreen(busy: Boolean, error: String?, onLogin: (String, String) -> Unit, onRegister: (String, String) -> Unit) {
    var email by remember { mutableStateOf("") }; var password by remember { mutableStateOf("") }; var register by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        Text("MELODICA IA", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(8.dp)); Text(if (register) "Crea il tuo account" else "Accedi al tuo studio musicale")
        Spacer(Modifier.height(24.dp))
        OutlinedTextField(email, { email = it }, label = { Text("Email") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(10.dp)); OutlinedTextField(password, { password = it }, label = { Text("Password") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        error?.let { Spacer(Modifier.height(8.dp)); Text(it, color = MaterialTheme.colorScheme.error) }
        Spacer(Modifier.height(18.dp))
        Button(enabled = !busy && email.contains("@") && password.length >= 8, onClick = { if (register) onRegister(email, password) else onLogin(email, password) }, modifier = Modifier.fillMaxWidth()) { Text(if (busy) "Attendi…" else if (register) "Registrati" else "Accedi") }
        TextButton(enabled = !busy, onClick = { register = !register }) { Text(if (register) "Ho già un account" else "Crea un account") }
    }
}

@Composable fun MelodicaApp(store: LocalStore, api: MelodicaBackend, session: SessionStore, billing: BillingManager, onLogout: () -> Unit) {
    val nav = rememberNavController(); var selectedId by remember { mutableLongStateOf(store.projects.firstOrNull()?.id ?: -1L) }; val current = store.projects.firstOrNull { it.id == selectedId } ?: store.projects.firstOrNull(); val snackbar = remember { SnackbarHostState() }; val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) {
        if (BuildConfig.MELODICA_API_ENABLED) {
            try { store.setCredits(api.getCredits().balance); store.replaceProjects(api.getProjects()) } catch (_: Throwable) { }
        }
    }
    Scaffold(snackbarHost = { SnackbarHost(snackbar) }, topBar = { TopAppBar(title = { Text("MELODICA IA", fontWeight = FontWeight.Bold) }, actions = { Text("${store.serverCredits} crediti", modifier = Modifier.padding(end = 12.dp), fontWeight = FontWeight.Bold); IconButton(onClick = onLogout) { Icon(Icons.Default.Logout, "Esci") } }) }, bottomBar = { NavigationBar { NavItem(nav, "home", "Home", Icons.Default.Home); NavItem(nav, "create", "Crea", Icons.Default.AddCircle); NavItem(nav, "library", "Libreria", Icons.Default.LibraryMusic); NavItem(nav, "credits", "Crediti", Icons.Default.AccountBalanceWallet) } }) { pad ->
        NavHost(nav, "home", Modifier.padding(pad)) {
            composable("home") { Home(nav, store, current) }
            composable("create") { Create(nav, store, api, snackbar, scope) { selectedId = it.id; nav.navigate("studio") } }
            composable("library") { Library(nav, store) { selectedId = it.id; nav.navigate("studio") } }
            composable("credits") { Credits(store, api, billing, scope, snackbar, onLogout) }
            composable("studio") { Studio(nav, store, api, session.token, current, snackbar, scope) }
            composable("voice") { Tool(nav, store, api, session.token, current, "Voice Lab", listOf("🎤 Voice Lab" to 75, "🎶 Cori & ad-libs" to 75), snackbar, scope) }
            composable("mix") { Tool(nav, store, api, session.token, current, "Mix & Master", listOf("📻 Radio Hit" to 30, "🎚️ Mastering" to 50), snackbar, scope) }
            composable("dna") { Tool(nav, store, api, session.token, current, "Music DNA", listOf("🧬 Music DNA" to 10), snackbar, scope) }
            composable("video") { Tool(nav, store, api, session.token, current, "Video Lab", listOf("🎬 Video completo" to 500, "👄 Lip Sync" to 250), snackbar, scope) }
            composable("export") { Tool(nav, store, api, session.token, current, "Export", listOf("🎧 Export MP3" to 0), snackbar, scope) }
        }
    }
}

@Composable fun androidx.compose.foundation.layout.RowScope.NavItem(nav: NavHostController, route: String, label: String, icon: androidx.compose.ui.graphics.vector.ImageVector) { val selected = nav.currentBackStackEntryAsState().value?.destination?.route == route; NavigationBarItem(selected = selected, onClick = { nav.navigate(route) { launchSingleTop = true } }, icon = { Icon(icon, null) }, label = { Text(label) }) }

@Composable fun Home(nav: NavHostController, store: LocalStore, current: Project?) {
    LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item { Card(shape = RoundedCornerShape(24.dp), modifier = Modifier.fillMaxWidth()) { Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) { Text("La tua idea diventa musica.", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold); Text("Crea brani, voci, mix e videoclip in un unico studio IA."); Button(onClick = { nav.navigate("create") }, modifier = Modifier.fillMaxWidth()) { Icon(Icons.Default.Add, null); Spacer(Modifier.width(8.dp)); Text("Nuovo brano") } } } }
        item { Text("Strumenti rapidi", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold) }
        items(featureCatalog.take(6)) { f -> ListItem(headlineContent = { Text(f.title, fontWeight = FontWeight.SemiBold) }, supportingContent = { Text("${f.subtitle} • ${if (f.cost == 0) "Richiede collegamento IA" else "${f.cost} crediti"}") }, leadingContent = { Text(f.emoji, style = MaterialTheme.typography.headlineSmall) }, modifier = Modifier.clickable { if (current != null) nav.navigate("studio") else nav.navigate("create") }) }
        item { Text("Progetto recente", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold); Spacer(Modifier.height(8.dp)); if (current == null) Text("Nessun progetto. Crea il tuo primo brano.") else ProjectCard(current) { nav.navigate("studio") } }
    }
}

@Composable fun Create(nav: NavHostController, store: LocalStore, api: MelodicaBackend, snackbar: SnackbarHostState, scope: kotlinx.coroutines.CoroutineScope, onCreated: (Project) -> Unit) {
    var title by remember { mutableStateOf("") }; var lyrics by remember { mutableStateOf("") }; var style by remember { mutableStateOf("Pop") }; var show by remember { mutableStateOf(false) }; var busy by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("Crea il tuo brano", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold); Text("Collegato al backend MELODICA IA.")
        OutlinedTextField(title, { title = it }, label = { Text("Titolo") }, modifier = Modifier.fillMaxWidth(), singleLine = true); OutlinedTextField(lyrics, { lyrics = it }, label = { Text("Testo / idea") }, modifier = Modifier.fillMaxWidth().height(180.dp))
        ExposedDropdownMenuBox(expanded = show, onExpandedChange = { show = !show }) { OutlinedTextField(style, {}, readOnly = true, label = { Text("Stile") }, trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(show) }, modifier = Modifier.menuAnchor().fillMaxWidth()); ExposedDropdownMenu(show, { show = false }) { listOf("Pop", "EDM", "Dance", "Rock", "Hip-Hop", "Cinematic").forEach { s -> DropdownMenuItem(text = { Text(s) }, onClick = { style = s; show = false }) } } }
        Button(enabled = !busy, onClick = {
            scope.launch {
                busy = true
                try { val r = api.createProject(title.ifBlank { "Nuovo progetto" }, style); onCreated(store.addProject(r.title, r.style, lyrics, r.id)) }
                catch (t: Throwable) { snackbar.showSnackbar(friendlyError(t)) }
                busy = false
            }
        }, modifier = Modifier.fillMaxWidth()) { Text(if (busy) "Creazione…" else "Crea progetto sul cloud") }
    }
}

@Composable fun Library(nav: NavHostController, store: LocalStore, onPick: (Project) -> Unit) { LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) { item { Text("La mia libreria", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold); Text("${store.projects.size} progetti sincronizzati con il cloud") }; items(store.projects) { p -> ProjectCard(p) { onPick(p) } }; if (store.projects.isEmpty()) item { Text("La libreria è vuota.") } } }

@Composable fun ProjectCard(p: Project, onClick: () -> Unit) { Card(Modifier.fillMaxWidth().clickable { onClick() }, shape = RoundedCornerShape(18.dp)) { Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text(p.title, fontWeight = FontWeight.Bold); Text(p.style) }; Text(p.status); LinearProgressIndicator(progress = { p.progress / 100f }, modifier = Modifier.fillMaxWidth()); Text("${p.progress}% • ${p.duration}") } } }

@Composable fun Studio(nav: NavHostController, store: LocalStore, api: MelodicaBackend, token: String?, current: Project?, snackbar: SnackbarHostState, scope: kotlinx.coroutines.CoroutineScope) {
    if (current == null) { Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("Crea prima un progetto.") }; return }
    val actions = listOf("📻 Radio Hit" to 30, "🚀 Club Hit" to 150, "🎤 Voice Lab" to 75, "🎚️ Mix & Master" to 50, "🧬 Music DNA" to 10, "🎬 Video Lab" to 500, "📤 Export" to 0)
    Column(Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(current.title, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold); Text("${current.style} • ${current.status}")
        Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(20.dp)) { Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) { Text("Player", fontWeight = FontWeight.Bold); Text(if (store.isPlaying) "Riproduzione" else "Pronto"); LinearProgressIndicator(progress = { current.progress / 100f }, modifier = Modifier.fillMaxWidth()); Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) { IconButton({}) { Icon(Icons.Default.SkipPrevious, null) }; IconButton({ store.togglePlayback(current, token) }) { Icon(if (store.isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow, null) }; IconButton({}) { Icon(Icons.Default.SkipNext, null) } } } }
        actions.forEach { (label, cost) -> Button(onClick = { when (label) { "🎤 Voice Lab" -> nav.navigate("voice"); "🎚️ Mix & Master" -> nav.navigate("mix"); "🧬 Music DNA" -> nav.navigate("dna"); "🎬 Video Lab" -> nav.navigate("video"); "📤 Export" -> nav.navigate("export"); else -> launchRemoteGeneration(store, api, current, label, cost, snackbar, scope) } }, modifier = Modifier.fillMaxWidth()) { Text(if (cost > 0) "$label • $cost crediti" else label) } }
    }
}

@Composable fun Tool(nav: NavHostController, store: LocalStore, api: MelodicaBackend, token: String?, current: Project?, title: String, actions: List<Pair<String, Int>>, snackbar: SnackbarHostState, scope: kotlinx.coroutines.CoroutineScope) {
    Column(Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) { Text(title, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold); Text("Operazioni eseguite dal backend MELODICA IA."); if (current == null) Text("Crea un progetto prima di usare questo strumento."); actions.forEach { (name, cost) -> Button(enabled = current != null, onClick = { current?.let { launchRemoteGeneration(store, api, it, name, cost, snackbar, scope) } }, modifier = Modifier.fillMaxWidth()) { Text(if (cost > 0) "$name • $cost crediti" else name) } }; OutlinedButton(onClick = { nav.popBackStack() }, modifier = Modifier.fillMaxWidth()) { Text("Torna allo studio") } }
}

private fun launchRemoteGeneration(store: LocalStore, api: MelodicaBackend, project: Project, label: String, cost: Int, snackbar: SnackbarHostState, scope: kotlinx.coroutines.CoroutineScope) {
    val remoteId = project.remoteId
    val mode = generationModes[label]
    if (remoteId == null || mode == null) { scope.launch { snackbar.showSnackbar("Progetto o modalità non disponibili") }; return }
    val idempotencyKey = UUID.randomUUID().toString()
    scope.launch {
        try {
            val jobId = api.createGeneration(remoteId, mode, "${project.title}\nStile: ${project.style}\n$label\n${project.lyrics}", idempotencyKey)
            store.update(project.id, "In coda • $label", 5); snackbar.showSnackbar("Job avviato: $label")
            repeat(60) {
                delay(1000)
                val job = api.getJobStatus(jobId)
                store.update(project.id, statusLabel(job.status, label), job.progress, job.assetUrl)
                if (job.status == "SUCCEEDED") { store.setCredits(api.getCredits().balance); return@launch }
                if (job.status == "FAILED" || job.status == "CANCELED") throw IllegalStateException(job.error ?: job.status)
            }
            throw IllegalStateException("JOB_TIMEOUT")
        } catch (t: Throwable) { snackbar.showSnackbar(friendlyError(t)) }
    }
}

private fun statusLabel(status: String, label: String) = when (status) { "QUEUED" -> "In coda • $label"; "RUNNING" -> "In elaborazione • $label"; "SUCCEEDED" -> "Completato • $label"; "CANCELED" -> "Annullato • $label"; else -> "Errore • $label" }

@Composable fun Credits(store: LocalStore, api: MelodicaBackend, billing: BillingManager, scope: kotlinx.coroutines.CoroutineScope, snackbar: SnackbarHostState, onAccountDeleted: () -> Unit) {
    var confirmDelete by remember { mutableStateOf(false) }
    val activity = LocalContext.current as? Activity
    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("Crediti", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(22.dp)) { Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) { Text("Saldo server", style = MaterialTheme.typography.labelLarge); Text("${store.serverCredits} crediti", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold); Text("Il saldo è verificato dal server MELODICA IA.") } }
        OutlinedButton(onClick = { scope.launch { try { store.setCredits(api.getCredits().balance) } catch (t: Throwable) { snackbar.showSnackbar(friendlyError(t)) } } }, modifier = Modifier.fillMaxWidth()) { Text("Aggiorna saldo") }
        Text("Acquista crediti", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        listOf("credits_500" to "500 crediti", "credits_1500" to "1500 crediti", "credits_5000" to "5000 crediti").forEach { (id, label) -> Button(enabled = activity != null, onClick = { activity?.let { billing.buy(it, id) } }, modifier = Modifier.fillMaxWidth()) { Text(label) } }
        Text("Gli acquisti vengono accreditati solo dopo verifica server-side di Google Play.", style = MaterialTheme.typography.bodySmall)
        HorizontalDivider()
        OutlinedButton(onClick = { confirmDelete = true }, modifier = Modifier.fillMaxWidth(), colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error)) { Text("Elimina account e dati") }
    }
    if (confirmDelete) AlertDialog(onDismissRequest = { confirmDelete = false }, title = { Text("Eliminare l’account?") }, text = { Text("L’operazione elimina account, progetti e crediti associati e non può essere annullata.") }, confirmButton = { TextButton(onClick = { confirmDelete = false; scope.launch { try { api.deleteAccount(); onAccountDeleted() } catch (t: Throwable) { snackbar.showSnackbar(friendlyError(t)) } } }) { Text("Elimina", color = MaterialTheme.colorScheme.error) } }, dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("Annulla") } })
}
