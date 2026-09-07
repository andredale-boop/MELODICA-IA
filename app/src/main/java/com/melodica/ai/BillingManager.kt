package com.melodica.ai

import android.app.Activity
import android.content.Context
import com.android.billingclient.api.*

/** Play Billing 9.1 integration shell. Product IDs must exist in Play Console. */
class BillingManager(context: Context, private val verifyPurchase: suspend (productId: String, purchaseToken: String) -> Boolean, private val onMessage: (String) -> Unit) {
    private val client = BillingClient.newBuilder(context.applicationContext)
        .setListener { result, purchases ->
            if (result.responseCode != BillingClient.BillingResponseCode.OK) {
                onMessage("Google Play: ${result.debugMessage}"); return@setListener
            }
            purchases.orEmpty().forEach { purchase ->
                if (purchase.purchaseState == Purchase.PurchaseState.PURCHASED) {
                    val productId = purchase.products.firstOrNull() ?: return@forEach
                    kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.IO).launch {
                        val verified = runCatching { verifyPurchase(productId, purchase.purchaseToken) }.getOrDefault(false)
                        if (!verified) { onMessage("Acquisto in attesa di verifica server-side"); return@launch }
                        if (!purchase.isAcknowledged) {
                            client.acknowledgePurchase(AcknowledgePurchaseParams.newBuilder().setPurchaseToken(purchase.purchaseToken).build()) { ack ->
                                onMessage(if (ack.responseCode == BillingClient.BillingResponseCode.OK) "Acquisto confermato" else "Acquisto verificato ma non confermato")
                            }
                        } else onMessage("Acquisto già confermato")
                    }
                }
            }
        }
        .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
        .enableAutoServiceReconnection()
        .build()

    private val products = mutableMapOf<String, ProductDetails>()

    fun connect(onReady: () -> Unit = {}) {
        client.startConnection(object : BillingClientStateListener {
            override fun onBillingServiceDisconnected() { onMessage("Google Play non disponibile. Riprova.") }
            override fun onBillingSetupFinished(result: BillingResult) {
                if (result.responseCode == BillingClient.BillingResponseCode.OK) { queryProducts(onReady) }
                else onMessage("Billing non disponibile: ${result.debugMessage}")
            }
        })
    }

    private fun queryProducts(onReady: () -> Unit) {
        val ids = listOf("credits_500", "credits_1500", "credits_5000")
        val list = ids.map { QueryProductDetailsParams.Product.newBuilder().setProductId(it).setProductType(BillingClient.ProductType.INAPP).build() }
        val params = QueryProductDetailsParams.newBuilder().setProductList(list).build()
        client.queryProductDetailsAsync(params) { result, response ->
            if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                products.clear(); response.productDetailsList.forEach { products[it.productId] = it }; onReady()
            } else onMessage("Impossibile leggere i prodotti Google Play")
        }
    }

    fun buy(activity: Activity, productId: String) {
        val product = products[productId] ?: run { onMessage("Prodotto non configurato in Google Play Console"); return }
        val offer = product.oneTimePurchaseOfferDetailsList?.firstOrNull() ?: run { onMessage("Offerta non disponibile"); return }
        val details = BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(product).setOfferToken(offer.offerToken).build()
        val result = client.launchBillingFlow(activity, BillingFlowParams.newBuilder().setProductDetailsParamsList(listOf(details)).build())
        if (result.responseCode != BillingClient.BillingResponseCode.OK) onMessage("Acquisto non avviato: ${result.debugMessage}")
    }

    fun endConnection() { client.endConnection() }
}
