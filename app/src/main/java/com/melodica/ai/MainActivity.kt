package com.melodica.ai

import android.content.Context
import android.os.Bundle
import android.media.MediaPlayer
import java.io.File
import java.io.FileOutputStream
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
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import androidx.navigation.compose.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

private const val DEMO_CREDITS = 500

data class Project(
    val id: Long,
    val title: String,
    val style: String,
    val status: String = "Bozza",
    val progress: Int = 0,
    val duration: String = "03:24",
    val lyrics: String = ""
)

data class Feature(val emoji: String, val title: String, val subtitle: String, val cost: Int)

private val featureCatalog = listOf(
    Feature("✨", "Migliora testo IA", "Hook, rime, struttura e riscrittura", 10),
    Feature("🎵", "Genera canzone", "Produzione completa da idea/testo", 100),
    Feature("📻", "Radio Hit", "Mix pop pronto per radio", 100),
    Feature("🚀", "Club Hit", "EDM, dance, drop e build-up", 100),
    Feature("🎤", "Voice Lab", "Voce, variazioni e interpretazione", 80),
    Feature("🎶", "Cori & ad-libs", "Armonie e backing vocals", 50),
    Feature("🔎", "Music Scanner", "BPM, tonalità e struttura", 40),
    Feature("🧬", "Music DNA", "Identità sonora riutilizzabile", 30),
    Feature("🛠️", "Remix IA", "Variazioni, estensioni e stem", 80),
    Feature("🎬", "Video completo", "Storyboard + scene musicali", 250),
    Feature("👄", "Lip Sync", "Sincronizzazione labiale", 60),
    Feature("🎚️", "Mastering", "Master finale e loudness", 50)
)

class LocalStore(private val context: Context) {
    private val prefs = context.getSharedPreferences("melodica_store", Context.MODE_PRIVATE)
    var projects by mutableStateOf(loadProjects()); private set
    var demoCredits by mutableIntStateOf(prefs.getInt("demo_credits", DEMO_CREDITS)); private set
    var isPlaying by mutableStateOf(false); private set
    private var player: MediaPlayer? = null

    private fun loadProjects(): List<Project> = runCatching {
        val a = JSONArray(prefs.getString("projects", "[]"))
        List(a.length()) { i ->
            val o = a.getJSONObject(i)
            Project(o.getLong("id"), o.getString("title"), o.getString("style"),
                o.optString("status", "Bozza"), o.optInt("progress", 0),
                o.optString("duration", "03:24"), o.optString("lyrics", ""))
        }
    }.getOrDefault(emptyList())

    private fun persist() {
        val a = JSONArray()
        projects.forEach { p ->
            a.put(JSONObject().apply {
                put("id", p.id); put("title", p.title); put("style", p.style)
                put("status", p.status); put("progress", p.progress)
                put("duration", p.duration); put("lyrics", p.lyrics)
            })
        }
        prefs.edit().putString("projects", a.toString()).putInt("demo_credits", demoCredits).apply()
    }

    fun addProject(title: String, style: String, lyrics: String): Project {
        val p = Project(System.currentTimeMillis(), title.ifBlank { "Nuovo progetto" }, style, lyrics = lyrics)
        projects = listOf(p) + projects; persist(); return p
    }

    fun update(id: Long, status: String, progress: Int) {
        projects = projects.map { if (it.id == id) it.copy(status = status, progress = progress) else it }
        persist()
    }

    fun spendDemo(cost: Int): Boolean {
        if (cost == 0) return true
        if (demoCredits < cost) return false
        demoCredits -= cost; persist(); return true
    }

    fun addDemoCredits(amount: Int) {
        demoCredits += amount; persist()
    }

    fun togglePlayback(project: Project) {
        if (isPlaying) { player?.stop(); player?.release(); player=null; isPlaying=false; return }
        val file=File(context.cacheDir, "${project.id}.wav")
        if (!file.exists()) createTone(file)
        player=MediaPlayer().apply { setDataSource(file.absolutePath); setOnCompletionListener { isPlaying=false; release() }; prepare(); start() }
        isPlaying=true
    }
    private fun createTone(file: File) {
        val rate=44100; val seconds=8; val samples=rate*seconds; val data=ByteArray(samples*2); val notes=doubleArrayOf(261.63,329.63,392.0,523.25,392.0,329.63,293.66,349.23)
        for(i in 0 until samples){ val t=i.toDouble()/rate; val n=notes[((t*2).toInt())%notes.size]; val env=minOf(1.0,t*10)*minOf(1.0,(seconds-t)*10); val v=sin(2*PI*n*t)*0.22*env; val x=(v*32767).toInt(); data[i*2]=(x and 255).toByte(); data[i*2+1]=((x shr 8) and 255).toByte() }
        FileOutputStream(file).use { out ->
            fun w(s:String){out.write(s.toByteArray(Charsets.US_ASCII))}; fun i16(v:Int){out.write(v and 255);out.write((v shr 8) and 255)}; fun i32(v:Int){out.write(v and 255);out.write((v shr 8) and 255);out.write((v shr 16) and 255);out.write((v shr 24) and 255)}
            w("RIFF");i32(36+data.size);w("WAVEfmt ");i32(16);i16(1);i16(1);i32(rate);i32(rate*2);i16(2);i16(16);w("data");i32(data.size);out.write(data)
        }
    }
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val store = LocalStore(this)
        setContent { MelodicaTheme { MelodicaApp(store) } }
    }
}

@Composable fun MelodicaTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = darkColorScheme(), content = content)
}

@Composable fun MelodicaApp(store: LocalStore) {
    val nav = rememberNavController()
    var selectedId by remember { mutableLongStateOf(store.projects.firstOrNull()?.id ?: -1L) }
    val current = store.projects.firstOrNull { it.id == selectedId } ?: store.projects.firstOrNull()
    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = { TopAppBar(
            title = { Text("MELODICA IA", fontWeight = FontWeight.Bold) },
            actions = { Text("${store.demoCredits} crediti", modifier = Modifier.padding(end = 16.dp), fontWeight = FontWeight.Bold) }
        ) },
        bottomBar = { NavigationBar {
            NavItem(nav, "home", "Home", Icons.Default.Home)
            NavItem(nav, "create", "Crea", Icons.Default.AddCircle)
            NavItem(nav, "library", "Libreria", Icons.Default.LibraryMusic)
            NavItem(nav, "credits", "Crediti", Icons.Default.AccountBalanceWallet)
        } }
    ) { pad ->
        NavHost(nav, "home", Modifier.padding(pad)) {
            composable("home") { Home(nav, store, current) }
            composable("create") { Create(nav, store) { selectedId = it.id; nav.navigate("studio") } }
            composable("library") { Library(nav, store) { selectedId = it.id; nav.navigate("studio") } }
            composable("credits") { Credits(store) }
            composable("studio") { Studio(nav, store, current, snackbar, scope) }
            composable("voice") { Tool(nav, store, current, "Voice Lab", listOf("🎤 Genera voce" to 80, "🎶 Genera cori" to 50), snackbar, scope) }
            composable("mix") { Tool(nav, store, current, "Mix & Master", listOf("⚖️ Auto Mix" to 0, "🎚️ Mastering" to 50), snackbar, scope) }
            composable("dna") { Tool(nav, store, current, "Music DNA", listOf("🧬 Analizza e salva DNA" to 30), snackbar, scope) }
            composable("video") { Tool(nav, store, current, "Video Lab", listOf("🎬 Storyboard" to 60, "🎞️ Video completo" to 250, "👄 Lip Sync" to 60, "🎨 Cambia stile" to 40), snackbar, scope) }
            composable("export") { Tool(nav, store, current, "Export", listOf("🎧 Export MP3" to 0, "🎵 WAV Master" to 10, "🎬 Video 1080p" to 30), snackbar, scope) }
        }
    }
}

@Composable fun NavItem(nav: NavHostController, route: String, label: String, icon: androidx.compose.ui.graphics.vector.ImageVector) {
    val selected = nav.currentBackStackEntryAsState().value?.destination?.route == route
    NavigationBarItem(selected = selected, onClick = { nav.navigate(route) { launchSingleTop = true } }, icon = { Icon(icon, null) }, label = { Text(label) })
}

@Composable fun Home(nav: NavHostController, store: LocalStore, current: Project?) {
    LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item {
            Card(shape = RoundedCornerShape(24.dp), modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("La tua idea diventa musica.", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                    Text("Crea brani, voci, mix e videoclip in un unico studio IA.")
                    Button(onClick = { nav.navigate("create") }, modifier = Modifier.fillMaxWidth()) { Icon(Icons.Default.Add, null); Spacer(Modifier.width(8.dp)); Text("Nuovo brano") }
                }
            }
        }
        item { Text("Strumenti rapidi", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold) }
        items(featureCatalog.take(6)) { f ->
            ListItem(headlineContent = { Text(f.title, fontWeight = FontWeight.SemiBold) }, supportingContent = { Text("${f.subtitle} • ${if (f.cost == 0) "Gratis" else "${f.cost} crediti"}") }, leadingContent = { Text(f.emoji, style = MaterialTheme.typography.headlineSmall) }, modifier = Modifier.clickable { if (current != null) nav.navigate("studio") else nav.navigate("create") })
        }
        item {
            Text("Progetto recente", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold); Spacer(Modifier.height(8.dp))
            if (current == null) Text("Nessun progetto. Crea il tuo primo brano.") else ProjectCard(current) { nav.navigate("studio") }
        }
    }
}

@Composable fun Create(nav: NavHostController, store: LocalStore, onCreated: (Project) -> Unit) {
    var title by remember { mutableStateOf("") }; var lyrics by remember { mutableStateOf("") }
    var style by remember { mutableStateOf("Pop") }; var show by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("Crea il tuo brano", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        Text(if (BuildConfig.MELODICA_API_ENABLED) "Generazione collegata al backend MELODICA IA." else "Modalità locale: configura il backend per la generazione reale.", style = MaterialTheme.typography.bodyMedium)
        OutlinedTextField(title, { title = it }, label = { Text("Titolo") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
        OutlinedTextField(lyrics, { lyrics = it }, label = { Text("Testo / idea") }, modifier = Modifier.fillMaxWidth().height(180.dp))
        ExposedDropdownMenuBox(expanded = show, onExpandedChange = { show = !show }) {
            OutlinedTextField(style, {}, readOnly = true, label = { Text("Stile") }, trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(show) }, modifier = Modifier.menuAnchor().fillMaxWidth())
            ExposedDropdownMenu(show, { show = false }) { listOf("Pop", "EDM", "Dance", "Rock", "Hip-Hop", "Cinematic").forEach { s -> DropdownMenuItem(text = { Text(s) }, onClick = { style = s; show = false }) } }
        }
        Button(onClick = { onCreated(store.addProject(title, style, lyrics)) }, modifier = Modifier.fillMaxWidth()) { Icon(Icons.Default.AutoAwesome, null); Spacer(Modifier.width(8.dp)); Text("Crea progetto") }
    }
}

@Composable fun Library(nav: NavHostController, store: LocalStore, onPick: (Project) -> Unit) {
    LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { Text("La mia libreria", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold); Text("${store.projects.size} progetti salvati sul dispositivo") }
        items(store.projects) { p -> ProjectCard(p) { onPick(p) } }
        if (store.projects.isEmpty()) item { Text("La libreria è vuota.") }
    }
}

@Composable fun ProjectCard(p: Project, onClick: () -> Unit) {
    Card(Modifier.fillMaxWidth().clickable { onClick() }, shape = RoundedCornerShape(18.dp)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text(p.title, fontWeight = FontWeight.Bold); Text(p.style) }
            Text(p.status); LinearProgressIndicator(progress = { p.progress / 100f }, modifier = Modifier.fillMaxWidth()); Text("${p.progress}% • ${p.duration}")
        }
    }
}

@Composable fun Studio(nav: NavHostController, store: LocalStore, current: Project?, snackbar: SnackbarHostState, scope: kotlinx.coroutines.CoroutineScope) {
    if (current == null) { Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("Crea prima un progetto.") }; return }
    val actions = listOf("📻 Radio Hit" to 100, "🚀 Club Hit" to 100, "🎤 Voice Lab" to 80, "🎚️ Mix & Master" to 50, "🧬 Music DNA" to 30, "🎬 Video Lab" to 60, "📤 Export" to 0)
    Column(Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(current.title, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold); Text("${current.style} • ${current.status}")
        Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(20.dp)) { Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Player", fontWeight = FontWeight.Bold); Text(if (store.isPlaying) "01:12 / ${current.duration}" else "00:00 / ${current.duration}"); LinearProgressIndicator(progress = { current.progress / 100f }, modifier = Modifier.fillMaxWidth())
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) { IconButton({}) { Icon(Icons.Default.SkipPrevious, null) }; IconButton({ store.togglePlayback(current) }) { Icon(if (store.isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow, null) }; IconButton({}) { Icon(Icons.Default.SkipNext, null) } }
        } }
        actions.forEach { (label, cost) ->
            Button(onClick = {
                when (label) {
                    "🎤 Voice Lab" -> nav.navigate("voice"); "🎚️ Mix & Master" -> nav.navigate("mix"); "🧬 Music DNA" -> nav.navigate("dna"); "🎬 Video Lab" -> nav.navigate("video"); "📤 Export" -> nav.navigate("export")
                    else -> launchGeneration(store, current, label, cost, snackbar, scope)
                }
            }, modifier = Modifier.fillMaxWidth()) { Text(if (cost > 0) "$label • $cost crediti" else label) }
        }
    }
}

@Composable fun Tool(nav: NavHostController, store: LocalStore, current: Project?, title: String, actions: List<Pair<String, Int>>, snackbar: SnackbarHostState, scope: kotlinx.coroutines.CoroutineScope) {
    Column(Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(title, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        Text("Build demo: il job viene simulato con avanzamento e stato persistente.")
        if (current == null) Text("Crea un progetto prima di usare questo strumento.")
        actions.forEach { (name, cost) -> Button(enabled = current != null, onClick = { current?.let { launchGeneration(store, it, name, cost, snackbar, scope) } }, modifier = Modifier.fillMaxWidth()) { Text(if (cost > 0) "$name • $cost crediti" else name) } }
        OutlinedButton(onClick = { nav.popBackStack() }, modifier = Modifier.fillMaxWidth()) { Text("Torna allo studio") }
    }
}

private fun launchGeneration(store: LocalStore, project: Project, label: String, cost: Int, snackbar: SnackbarHostState, scope: kotlinx.coroutines.CoroutineScope) {
    if (!store.spendDemo(cost)) { scope.launch { snackbar.showSnackbar("Crediti demo insufficienti") }; return }
    scope.launch {
        store.update(project.id, "In coda • $label", 5); snackbar.showSnackbar("Job avviato: $label")
        for (progress in listOf(20, 45, 70, 90, 100)) { delay(450); store.update(project.id, if (progress == 100) "Completato • $label" else "In elaborazione • $label", progress)
            if (progress == 100) store.prepareAudio(project.id) }
        snackbar.showSnackbar("Operazione completata")
    }
}

@Composable fun Credits(store: LocalStore) {
    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("Crediti", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(22.dp)) { Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) { Text("Saldo demo", style = MaterialTheme.typography.labelLarge); Text("${store.demoCredits} crediti", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold); Text("Il saldo è locale e serve per provare i flussi. In produzione sarà server-side.") } }
        Text("Pacchetti demo", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        OutlinedButton(onClick = { store.addDemoCredits(500) }, modifier = Modifier.fillMaxWidth()) { Text("Aggiungi 500 crediti demo") }
        Text("Per la pubblicazione servono Billing, verifica server-side, account e backend IA reale.", style = MaterialTheme.typography.bodySmall)
    }
}
