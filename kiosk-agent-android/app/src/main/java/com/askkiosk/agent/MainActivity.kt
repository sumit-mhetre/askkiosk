package com.askkiosk.agent

import android.content.Context
import android.content.SharedPreferences
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.WindowManager
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
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
 * - Shows the kiosk web page full-screen.
 * - Polls the backend and prints jobs automatically (raw port 9100).
 * - Settings (printer IP, URLs, kiosk id) are entered on-device and saved.
 * - Auto-Detect Printer uses Android NSD (mDNS/Bonjour) to find printers on
 *   the local network. Manual IP entry remains as a fallback.
 *
 * Long-press the kiosk screen to reopen Setup.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var prefs: SharedPreferences
    private lateinit var rootKiosk: WebView
    private val handler = Handler(Looper.getMainLooper())
    private val scope = CoroutineScope(Dispatchers.IO)
    @Volatile private var working = false
    private var pollStarted = false

    // NSD
    private var nsdManager: NsdManager? = null
    private var discoveryListener: NsdManager.DiscoveryListener? = null
    private val foundPrinters = LinkedHashMap<String, String>() // name -> ip
    private var ipField: EditText? = null
    private var foundView: TextView? = null

    private val DEF_BACKEND = "https://askkiosk.onrender.com"
    private val DEF_KIOSK_PAGE = "https://askkiosk-app.onrender.com/kiosk"
    private val DEF_PORT = 9100
    private val POLL_MS = 3000L

    // mDNS service types printers commonly advertise.
    private val PRINTER_SERVICE_TYPES = listOf(
        "_pdl-datastream._tcp.", // raw 9100 (this is what we want)
        "_ipp._tcp.",            // IPP
        "_printer._tcp."         // LPD
    )

    private fun backendUrl() = prefs.getString("backend_url", DEF_BACKEND)!!.trimEnd('/')
    private fun kioskPage() = prefs.getString("kiosk_page", DEF_KIOSK_PAGE)!!
    private fun kioskId() = prefs.getString("kiosk_id", "") ?: ""
    private fun printerIp() = prefs.getString("printer_ip", "") ?: ""
    private fun printerPort() = prefs.getInt("printer_port", DEF_PORT)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = getSharedPreferences("askkiosk", Context.MODE_PRIVATE)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        nsdManager = getSystemService(Context.NSD_SERVICE) as NsdManager
        if (printerIp().isEmpty()) showSettings() else showKiosk()
    }

    private fun showKiosk() {
        stopDiscovery()
        rootKiosk = WebView(this)
        setContentView(rootKiosk)
        val s: WebSettings = rootKiosk.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        rootKiosk.webViewClient = WebViewClient()
        rootKiosk.loadUrl(kioskPage())
        rootKiosk.setOnLongClickListener {
            showSettings()
            true
        }
        if (!pollStarted) {
            pollStarted = true
            handler.postDelayed(pollRunnable, POLL_MS)
        }
    }

    private fun showSettings() {
        val pad = (16 * resources.displayMetrics.density).toInt()
        val layout = LinearLayout(this)
        layout.orientation = LinearLayout.VERTICAL
        layout.setPadding(pad, pad, pad, pad)

        val title = TextView(this)
        title.text = "ASK Kiosk - Setup"
        title.textSize = 22f
        title.setPadding(0, 0, 0, pad)
        layout.addView(title)

        val backend = labeledInput(layout, "Backend URL", backendUrl())
        val page = labeledInput(layout, "Kiosk Page URL", kioskPage())

        // Auto-detect section
        val detectBtn = Button(this)
        detectBtn.text = "Auto-Detect Printer"
        detectBtn.setOnClickListener { startDiscovery() }
        layout.addView(detectBtn)

        val found = TextView(this)
        found.text = "No printers detected yet. Tap Auto-Detect, or type the IP below."
        found.setPadding(0, 8, 0, 8)
        layout.addView(found)
        foundView = found

        val ip = labeledInput(layout, "Printer IP (e.g. 192.168.1.50)", printerIp())
        ipField = ip
        val port = labeledInput(layout, "Printer Port", printerPort().toString())
        val kid = labeledInput(layout, "Kiosk ID (blank for single kiosk)", kioskId())

        val test = Button(this)
        test.text = "Test Printer Connection"
        test.setOnClickListener {
            testPrinter(ip.text.toString().trim(), port.text.toString().trim().toIntOrNull() ?: DEF_PORT)
        }
        layout.addView(test)

        val save = Button(this)
        save.text = "Save and Start"
        save.setOnClickListener {
            val ipVal = ip.text.toString().trim()
            if (ipVal.isEmpty()) {
                Toast.makeText(this, "Printer IP is required.", Toast.LENGTH_LONG).show()
                return@setOnClickListener
            }
            val portVal = port.text.toString().trim().toIntOrNull() ?: DEF_PORT
            prefs.edit()
                .putString("backend_url", backend.text.toString().trim())
                .putString("kiosk_page", page.text.toString().trim())
                .putString("printer_ip", ipVal)
                .putInt("printer_port", portVal)
                .putString("kiosk_id", kid.text.toString().trim())
                .apply()
            Toast.makeText(this, "Saved.", Toast.LENGTH_SHORT).show()
            showKiosk()
        }
        save.setPadding(0, pad, 0, 0)
        layout.addView(save)

        // Wrap in a scroll view so it fits small screens.
        val scroll = android.widget.ScrollView(this)
        scroll.addView(layout)
        setContentView(scroll)
    }

    private fun labeledInput(parent: LinearLayout, label: String, value: String): EditText {
        val tv = TextView(this)
        tv.text = label
        tv.setPadding(0, 12, 0, 4)
        parent.addView(tv)
        val et = EditText(this)
        et.setText(value)
        parent.addView(et)
        return et
    }

    // ---- NSD auto-discovery ----
    private fun startDiscovery() {
        foundPrinters.clear()
        foundView?.text = "Scanning for printers..."
        // Discover the raw-print service type first; printers usually advertise it.
        discoverType("_pdl-datastream._tcp.")
        // Also try IPP as a secondary signal.
        Handler(Looper.getMainLooper()).postDelayed({ discoverType("_ipp._tcp.") }, 500)
        // Stop after 6 seconds and show results.
        Handler(Looper.getMainLooper()).postDelayed({
            stopDiscovery()
            showFoundResults()
        }, 6000)
    }

    private fun discoverType(serviceType: String) {
        val listener = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(s: String?) {}
            override fun onStartDiscoveryFailed(s: String?, e: Int) {}
            override fun onStopDiscoveryFailed(s: String?, e: Int) {}
            override fun onDiscoveryStopped(s: String?) {}
            override fun onServiceLost(info: NsdServiceInfo?) {}
            override fun onServiceFound(info: NsdServiceInfo?) {
                if (info == null) return
                nsdManager?.resolveService(info, object : NsdManager.ResolveListener {
                    override fun onResolveFailed(i: NsdServiceInfo?, e: Int) {}
                    override fun onServiceResolved(resolved: NsdServiceInfo?) {
                        if (resolved == null) return
                        val host = resolved.host?.hostAddress ?: return
                        val name = resolved.serviceName ?: host
                        synchronized(foundPrinters) { foundPrinters[name] = host }
                        runOnUiThread { showFoundResults() }
                    }
                })
            }
        }
        discoveryListener = listener
        try {
            nsdManager?.discoverServices(serviceType, NsdManager.PROTOCOL_DNS_SD, listener)
        } catch (e: Exception) {
            // ignore
        }
    }

    private fun stopDiscovery() {
        try {
            discoveryListener?.let { nsdManager?.stopServiceDiscovery(it) }
        } catch (e: Exception) {
        }
        discoveryListener = null
    }

    private fun showFoundResults() {
        if (foundPrinters.isEmpty()) {
            foundView?.text = "No printers auto-detected. Please type the IP manually below."
            return
        }
        val sb = StringBuilder("Detected printers (tap to use):\n")
        for ((name, ip) in foundPrinters) sb.append("- $name  ($ip)\n")
        foundView?.text = sb.toString().trim()
        // Auto-fill the first one found; user can change.
        val firstIp = foundPrinters.values.firstOrNull()
        if (firstIp != null && ipField?.text?.isBlank() == true) {
            ipField?.setText(firstIp)
        }
        // Make the result line tappable to fill the first IP.
        foundView?.setOnClickListener {
            firstIp?.let {
                ipField?.setText(it)
                Toast.makeText(this, "Using $it", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun testPrinter(ip: String, port: Int) {
        if (ip.isEmpty()) {
            Toast.makeText(this, "Enter an IP first.", Toast.LENGTH_SHORT).show()
            return
        }
        scope.launch {
            val ok = try {
                Socket(ip, port).use { true }
            } catch (e: Exception) {
                false
            }
            runOnUiThread {
                Toast.makeText(
                    this,
                    if (ok) "Printer reachable at $ip:$port" else "Cannot reach $ip:$port",
                    Toast.LENGTH_LONG
                ).show()
            }
        }
    }

    private val pollRunnable = object : Runnable {
        override fun run() {
            pollOnce()
            handler.postDelayed(this, POLL_MS)
        }
    }

    private fun pollOnce() {
        if (working || printerIp().isEmpty()) return
        working = true
        scope.launch {
            try {
                val q = if (kioskId().isNotEmpty()) "?kioskId=${kioskId()}" else ""
                val res = httpGet("${backendUrl()}/api/agent/next-job$q")
                val obj = JSONObject(res)
                if (!obj.isNull("job")) {
                    val job = obj.getJSONObject("job")
                    val jobId = job.getString("id")
                    val fileUrl = backendUrl() + job.getString("fileUrl")
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
            } finally {
                working = false
            }
        }
    }

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
        Socket(printerIp(), printerPort()).use { socket ->
            val out: OutputStream = socket.getOutputStream()
            out.write(bytes)
            out.flush()
            Thread.sleep(800)
        }
    }

    private fun reportResult(jobId: String, ok: Boolean, error: String?) {
        try {
            val conn = URL("${backendUrl()}/api/jobs/$jobId/print-result")
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
        }
    }

    override fun onDestroy() {
        stopDiscovery()
        handler.removeCallbacks(pollRunnable)
        super.onDestroy()
    }
}
