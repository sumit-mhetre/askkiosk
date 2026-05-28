package com.askkiosk.agent

import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.WindowManager
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.Socket
import java.net.URL

/**
 * ASK Kiosk Android Agent.
 *
 * Two jobs in one app:
 *  1. Show the kiosk web page full-screen (the QR + code entry UI).
 *  2. In the background, poll the backend for jobs ready to print, download
 *     them, and send them to the printer over the local network (raw 9100).
 *
 * Configure BACKEND_URL, PRINTER_IP, PRINTER_PORT, and optional KIOSK_ID below
 * (or move them to a settings screen later).
 */
class MainActivity : AppCompatActivity() {

    // ---- Config: set these for your deployment ----
    private val BACKEND_URL = "https://askkiosk.onrender.com"
    private val KIOSK_PAGE = "$BACKEND_URL".let { "https://askkiosk-app.onrender.com/kiosk" }
    private val KIOSK_ID = ""          // blank = active kiosk
    private val PRINTER_IP = "192.168.1.50"  // set your printer's IP
    private val PRINTER_PORT = 9100
    private val POLL_MS = 3000L

    private lateinit var webView: WebView
    private val handler = Handler(Looper.getMainLooper())
    private val scope = CoroutineScope(Dispatchers.IO)
    @Volatile private var working = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Keep screen on (kiosk should never sleep).
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        webView = WebView(this)
        setContentView(webView)

        val s: WebSettings = webView.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        webView.webViewClient = WebViewClient()
        webView.loadUrl(KIOSK_PAGE)

        // Start the polling loop.
        handler.postDelayed(pollRunnable, POLL_MS)
    }

    private val pollRunnable = object : Runnable {
        override fun run() {
            pollOnce()
            handler.postDelayed(this, POLL_MS)
        }
    }

    private fun pollOnce() {
        if (working) return
        working = true
        scope.launch {
            try {
                val q = if (KIOSK_ID.isNotEmpty()) "?kioskId=$KIOSK_ID" else ""
                val res = httpGet("$BACKEND_URL/api/agent/next-job$q")
                val obj = JSONObject(res)
                if (!obj.isNull("job")) {
                    val job = obj.getJSONObject("job")
                    val jobId = job.getString("id")
                    val fileUrl = BACKEND_URL + job.getString("fileUrl")
                    val copies = job.optInt("copies", 1)
                    try {
                        val bytes = httpGetBytes(fileUrl)
                        for (i in 0 until maxOf(1, copies)) {
                            sendToPrinter(bytes)
                            Thread.sleep(1200)
                        }
                        reportResult(jobId, true, null)
                    } catch (e: Exception) {
                        reportResult(jobId, false, e.message)
                    }
                }
            } catch (e: Exception) {
                // network error; ignore and keep polling
            } finally {
                working = false
            }
        }
    }

    // ---- Networking helpers ----

    private fun httpGet(urlStr: String): String {
        val conn = URL(urlStr).openConnection() as HttpURLConnection
        conn.requestMethod = "GET"
        conn.connectTimeout = 10000
        conn.readTimeout = 15000
        val text = BufferedReader(InputStreamReader(conn.inputStream)).readText()
        conn.disconnect()
        return text
    }

    private fun httpGetBytes(urlStr: String): ByteArray {
        val conn = URL(urlStr).openConnection() as HttpURLConnection
        conn.requestMethod = "GET"
        conn.connectTimeout = 10000
        conn.readTimeout = 30000
        val bytes = conn.inputStream.readBytes()
        conn.disconnect()
        return bytes
    }

    private fun sendToPrinter(bytes: ByteArray) {
        Socket(PRINTER_IP, PRINTER_PORT).use { socket ->
            val out: OutputStream = socket.getOutputStream()
            out.write(bytes)
            out.flush()
            Thread.sleep(800)
        }
    }

    private fun reportResult(jobId: String, ok: Boolean, error: String?) {
        try {
            val conn = URL("$BACKEND_URL/api/jobs/$jobId/print-result")
                .openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            val body = JSONObject()
            body.put("ok", ok)
            if (error != null) body.put("error", error)
            conn.outputStream.use { it.write(body.toString().toByteArray()) }
            conn.inputStream.use { it.readBytes() }
            conn.disconnect()
        } catch (e: Exception) {
            // ignore
        }
    }

    override fun onDestroy() {
        handler.removeCallbacks(pollRunnable)
        super.onDestroy()
    }
}
