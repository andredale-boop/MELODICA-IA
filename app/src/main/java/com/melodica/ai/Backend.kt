package com.melodica.ai

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

interface MelodicaBackend {
    suspend fun createGeneration(projectId: String, mode: String, prompt: String): String
    suspend fun getJobStatus(jobId: String): GenerationJob
    suspend fun cancelJob(jobId: String)
    suspend fun getCredits(): Credits
}

data class GenerationJob(
    val id: String,
    val status: String,
    val progress: Int,
    val assetUrl: String? = null,
    val error: String? = null
)

data class Credits(val balance: Int, val reserved: Int)

class ApiBackend(private val baseUrl: String, private val tokenProvider: () -> String?) : MelodicaBackend {
    private fun request(method: String, path: String, body: JSONObject? = null): JSONObject {
        val conn = (URL(baseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection)
        conn.requestMethod = method
        conn.connectTimeout = 10_000
        conn.readTimeout = 20_000
        conn.setRequestProperty("Accept", "application/json")
        tokenProvider()?.takeIf { it.isNotBlank() }?.let { conn.setRequestProperty("Authorization", "Bearer $it") }
        if (body != null) {
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            conn.outputStream.use { it.write(body.toString().toByteArray()) }
        }
        val stream = if (conn.responseCode in 200..299) conn.inputStream else conn.errorStream
        val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
        if (conn.responseCode !in 200..299) error("API ${conn.responseCode}: $text")
        return if (text.isBlank()) JSONObject() else JSONObject(text)
    }
    override suspend fun createGeneration(projectId: String, mode: String, prompt: String): String {
        val body = JSONObject().put("projectId", projectId).put("mode", mode).put("prompt", prompt).put("idempotencyKey", UUID.randomUUID().toString())
        return request("POST", "/v1/generations", body).getString("id")
    }
    override suspend fun getJobStatus(jobId: String): GenerationJob {
        val o=request("GET", "/v1/generations/$jobId")
        return GenerationJob(o.getString("id"),o.getString("status"),o.optInt("progress"),o.optString("assetUrl").takeIf { it.isNotBlank() && it != "null" },o.optString("error").takeIf { it.isNotBlank() && it != "null" })
    }
    override suspend fun cancelJob(jobId: String) { request("POST", "/v1/generations/$jobId/cancel") }
    override suspend fun getCredits(): Credits { val o=request("GET", "/v1/credits"); return Credits(o.optInt("balance"),o.optInt("reserved")) }
}

class DemoBackend : MelodicaBackend {
    private val jobs=mutableMapOf<String,GenerationJob>()
    private var credits=500
    override suspend fun createGeneration(projectId:String,mode:String,prompt:String):String { val id="demo-${UUID.randomUUID()}"; jobs[id]=GenerationJob(id,"QUEUED",0); return id }
    override suspend fun getJobStatus(jobId:String)=jobs[jobId] ?: GenerationJob(jobId,"FAILED",0,error="JOB_NOT_FOUND")
    override suspend fun cancelJob(jobId:String) { jobs[jobId]=GenerationJob(jobId,"CANCELED",0) }
    override suspend fun getCredits()=Credits(credits,0)
}
