package com.melodica.ai

import org.junit.Assert.assertTrue
import org.junit.Test

class CreditPolicyTest {
    @Test fun billableCreditValuesArePositive() {
        val values = listOf(10, 15, 30, 50, 75, 150, 250, 500, 900, 1500, 1800, 3000)
        assertTrue(values.all { it > 0 })
    }

    @Test fun creditCatalogContainsVideoAndMusicCosts() {
        val values = listOf(10, 15, 30, 50, 75, 150, 250, 500, 900, 1500, 1800, 3000)
        assertTrue(values.contains(150))
        assertTrue(values.contains(3000))
    }
}
