package com.melodica.ai

import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

data class AuthUser(val id: String, val email: String)
data class RemoteProject(val id: String, val title: String, val style: String)

data class GenerationJob(
    val id: String,
    val status: String,
    val progress: Int,
    val assetUrl: String? = null,
    val error: String? = null
)

data class Credits(val balance: Int, val reserved: Int)

interface MelodicaBackend {
    suspend fun register(email: String, password: String): AuthUser
    suspend fun login(email: String, password: String): AuthUser
    suspend fun me(): AuthUser
    suspend fun getCredits(): Credits
    suspend fun getProjects(): List<RemoteProject>
    suspend fun createProject(title: String, style: String): RemoteProject
    suspend fun createGeneration(projectId: String, mode: String, prompt: String, idempotencyKey: String): String
    suspend fun rewriteText(text: String, action: String, style: String): String
    suspend fun getJobStatus(jobId: String): GenerationJob
    suspend fun cancelJob(jobId: String)
    suspend fun deleteAccount()
    suspend fun verifyPurchase(productId: String, purchaseToken: String): Boolean
    fun logout()
}

class ApiBackend(
    private val baseUrl: String,
    private val tokenProvider: () -> String?,
    private val tokenSetter: (String?) -> Unit
) : MelodicaBackend {
    private fun requestText(method: String, path: String, body: JSONObject? = null): String {
        val conn = (URL(baseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection)
        conn.requestMethod = method
        conn.connectTimeout = 10_000
        conn.readTimeout = 30_000
        conn.setRequestProperty("Accept", "application/json")
        tokenProvider()?.takeIf { it.isNotBlank() }?.let { conn.setRequestProperty("Authorization", "Bearer $it") }
        if (body != null) {
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
        }
        val code = conn.responseCode
        val stream = if (code in 200..299) conn.inputStream else conn.errorStream
        val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
        if (code !in 200..299) error("API $code: $text")
        return text
    }

    private fun request(method: String, path: String, body: JSONObject? = null): JSONObject =
        JSONObject(requestText(method, path, body))

    private fun authResult(o: JSONObject): AuthUser {
        val token = o.optString("token").takeIf { it.isNotBlank() }
        if (token != null) tokenSetter(token)
        val user = o.getJSONObject("user")
        return AuthUser(user.getString("id"), user.getString("email"))
    }

    override suspend fun register(email: String, password: String): AuthUser =
        authResult(request("POST", "/v1/auth/register", JSONObject().put("email", email.trim()).put("password", password)))

    override suspend fun login(email: String, password: String): AuthUser =
        authResult(request("POST", "/v1/auth/login", JSONObject().put("email", email.trim()).put("password", password)))

    override suspend fun me(): AuthUser {
        val user = request("GET", "/v1/me").getJSONObject("user")
        return AuthUser(user.getString("id"), user.getString("email"))
    }

    override suspend fun getCredits(): Credits {
        val o = request("GET", "/v1/credits")
        return Credits(o.optInt("balance"), o.optInt("reserved"))
    }

    override suspend fun getProjects(): List<RemoteProject> {
        val a = JSONArray(requestText("GET", "/v1/projects"))
        return List(a.length()) { i ->
            val o = a.getJSONObject(i)
            RemoteProject(o.getString("id"), o.getString("title"), o.getString("style"))
        }
    }

    override suspend fun createProject(title: String, style: String): RemoteProject {
        val o = request("POST", "/v1/projects", JSONObject().put("title", title).put("style", style))
        return RemoteProject(o.getString("id"), o.getString("title"), o.getString("style"))
    }

    override suspend fun createGeneration(projectId: String, mode: String, prompt: String, idempotencyKey: String): String {
        val body = JSONObject()
            .put("projectId", projectId)
            .put("mode", mode)
            .put("prompt", prompt)
            .put("idempotencyKey", idempotencyKey)
        return request("POST", "/v1/generations", body).getString("id")
    }

    override suspend fun rewriteText(text: String, action: String, style: String): String {
        val body = JSONObject()
            .put("text", text)
            .put("action", action)
            .put("style", style)

        return request("POST", "/v1/ai/rewrite", body).getString("text")
    }

    override suspend fun getJobStatus(jobId: String): GenerationJob {
        val o = request("GET", "/v1/generations/$jobId")
        return GenerationJob(
            o.getString("id"),
            o.getString("status"),
            o.optInt("progress"),
            o.optString("assetUrl").takeIf { it.isNotBlank() && it != "null" },
            o.optString("error").takeIf { it.isNotBlank() && it != "null" }
        )
    }

    override suspend fun cancelJob(jobId: String) { request("POST", "/v1/generations/$jobId/cancel") }

    override suspend fun deleteAccount() { requestText("DELETE", "/v1/account") }

    override suspend fun verifyPurchase(productId: String, purchaseToken: String): Boolean {
        val response = request("POST", "/v1/billing/verify", JSONObject()
            .put("productId", productId)
            .put("purchaseToken", purchaseToken))
        return response.optBoolean("verified", false)
    }

    override fun logout() { tokenSetter(null) }
}
