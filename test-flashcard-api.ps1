$base = "http://localhost:3001/api"
$pass = 0
$fail = 0

# Login as trainer
$loginBody = '{"email":"admin@macsoft.com","password":"Test1234"}'
$loginRes = Invoke-RestMethod -Uri "$base/auth/login" -Method POST -Body $loginBody -ContentType "application/json"
$token = $loginRes.accessToken
$headers = @{ "Authorization" = "Bearer $token" }

Write-Host "`n=== FLASHCARD API TESTS ===" -ForegroundColor Cyan

# 1. Create deck with cards
Write-Host "`n[1] POST /flashcards/decks - Create deck" -ForegroundColor Yellow
try {
    $createBody = @'
{
  "title": "Real Estate Basics",
  "titleAr": null,
  "description": "Fundamental concepts in real estate",
  "descriptionAr": null,
  "category": "fundamentals",
  "cards": [
    {
      "front": "What is a CMA?",
      "frontAr": null,
      "back": "Comparative Market Analysis",
      "backAr": null,
      "hint": "Think: comparing similar homes",
      "hintAr": null,
      "orderInDeck": 0
    },
    {
      "front": "What is ROI?",
      "frontAr": null,
      "back": "Return on Investment",
      "backAr": null,
      "hint": "Profit / Cost",
      "hintAr": null,
      "orderInDeck": 1
    },
    {
      "front": "What is a deed?",
      "frontAr": null,
      "back": "Legal ownership transfer document",
      "backAr": null,
      "hint": "Ownership paper",
      "hintAr": null,
      "orderInDeck": 2
    }
  ]
}
'@
    $deck = Invoke-RestMethod -Uri "$base/flashcards/decks" -Method POST -Body $createBody -ContentType "application/json" -Headers $headers
    $deckId = $deck.id
    Write-Host "  PASS - Created deck: $deckId (cards: $($deck.cardCount))" -ForegroundColor Green
    $pass++
} catch {
    Write-Host "  FAIL - $($_.Exception.Message)" -ForegroundColor Red
    $fail++
}

# 2. List decks for admin
Write-Host "`n[2] GET /flashcards/decks/manage - Admin list" -ForegroundColor Yellow
try {
    $list = Invoke-RestMethod -Uri "$base/flashcards/decks/manage" -Method GET -Headers $headers
    Write-Host "  PASS - Decks found: $($list.decks.Count)" -ForegroundColor Green
    $pass++
} catch {
    Write-Host "  FAIL - $($_.Exception.Message)" -ForegroundColor Red
    $fail++
}

# 3. Get deck for admin
Write-Host "`n[3] GET /flashcards/decks/$deckId/admin - Admin detail" -ForegroundColor Yellow
try {
    $detail = Invoke-RestMethod -Uri "$base/flashcards/decks/$deckId/admin" -Method GET -Headers $headers
    Write-Host "  PASS - Title: $($detail.title), Cards: $($detail.cards.Count)" -ForegroundColor Green
    $pass++
} catch {
    Write-Host "  FAIL - $($_.Exception.Message)" -ForegroundColor Red
    $fail++
}

# 4. Update deck
Write-Host "`n[4] PUT /flashcards/decks/$deckId - Update deck" -ForegroundColor Yellow
try {
    $updateBody = '{"title": "Real Estate Basics v2", "description": "Updated fundamentals"}'
    $updated = Invoke-RestMethod -Uri "$base/flashcards/decks/$deckId" -Method PUT -Body $updateBody -ContentType "application/json" -Headers $headers
    Write-Host "  PASS - Updated title: $($updated.title)" -ForegroundColor Green
    $pass++
} catch {
    Write-Host "  FAIL - $($_.Exception.Message)" -ForegroundColor Red
    $fail++
}

# 5. Add card to deck
Write-Host "`n[5] POST /flashcards/decks/$deckId/cards - Add card" -ForegroundColor Yellow
try {
    $cardBody = '{"front": "What is escrow?", "back": "Third-party fund holding account", "hint": "Neutral money holder", "orderInDeck": 3}'
    $newCard = Invoke-RestMethod -Uri "$base/flashcards/decks/$deckId/cards" -Method POST -Body $cardBody -ContentType "application/json" -Headers $headers
    $cardId = $newCard.id
    Write-Host "  PASS - Added card: $cardId" -ForegroundColor Green
    $pass++
} catch {
    Write-Host "  FAIL - $($_.Exception.Message)" -ForegroundColor Red
    $fail++
}

# 6. Update card
Write-Host "`n[6] PUT /flashcards/cards/$cardId - Update card" -ForegroundColor Yellow
try {
    $updateCardBody = '{"front": "What is an escrow account?", "back": "A third-party account holding funds during transactions"}'
    $updCard = Invoke-RestMethod -Uri "$base/flashcards/cards/$cardId" -Method PUT -Body $updateCardBody -ContentType "application/json" -Headers $headers
    Write-Host "  PASS - Updated card front: $($updCard.front)" -ForegroundColor Green
    $pass++
} catch {
    Write-Host "  FAIL - $($_.Exception.Message)" -ForegroundColor Red
    $fail++
}

# 7. Publish deck
Write-Host "`n[7] PATCH /flashcards/decks/$deckId/publish - Publish" -ForegroundColor Yellow
try {
    $pubBody = '{"publish": true}'
    $pubRes = Invoke-RestMethod -Uri "$base/flashcards/decks/$deckId/publish" -Method PATCH -Body $pubBody -ContentType "application/json" -Headers $headers
    Write-Host "  PASS - $($pubRes.message)" -ForegroundColor Green
    $pass++
} catch {
    Write-Host "  FAIL - $($_.Exception.Message)" -ForegroundColor Red
    $fail++
}

# 8. Get available decks (trainee view)
Write-Host "`n[8] GET /flashcards/decks/available - Available decks" -ForegroundColor Yellow
try {
    $avail = Invoke-RestMethod -Uri "$base/flashcards/decks/available" -Method GET -Headers $headers
    Write-Host "  PASS - Available: $($avail.decks.Count) decks" -ForegroundColor Green
    $pass++
} catch {
    Write-Host "  FAIL - $($_.Exception.Message)" -ForegroundColor Red
    $fail++
}

# 9. Get study cards
Write-Host "`n[9] GET /flashcards/decks/$deckId/study - Study cards" -ForegroundColor Yellow
try {
    $study = Invoke-RestMethod -Uri "$base/flashcards/decks/$deckId/study" -Method GET -Headers $headers
    Write-Host "  PASS - Due cards: $($study.totalDue)" -ForegroundColor Green
    $firstCardId = $study.cards[0].id
    $pass++
} catch {
    Write-Host "  FAIL - $($_.Exception.Message)" -ForegroundColor Red
    $fail++
}

# 10. Submit review (quality 5 - perfect)
Write-Host "`n[10] POST /flashcards/cards/$firstCardId/review - Review card (q=5)" -ForegroundColor Yellow
try {
    $reviewBody = '{"quality": 5}'
    $review = Invoke-RestMethod -Uri "$base/flashcards/cards/$firstCardId/review" -Method POST -Body $reviewBody -ContentType "application/json" -Headers $headers
    Write-Host "  PASS - EF: $($review.newEaseFactor), Interval: $($review.newInterval)d, Level: $($review.masteryLevel)" -ForegroundColor Green
    $pass++
} catch {
    Write-Host "  FAIL - $($_.Exception.Message)" -ForegroundColor Red
    $fail++
}

# 11. Submit review (quality 1 - wrong)
$secondCardId = $study.cards[1].id
Write-Host "`n[11] POST /flashcards/cards/$secondCardId/review - Review card (q=1)" -ForegroundColor Yellow
try {
    $reviewBody2 = '{"quality": 1}'
    $review2 = Invoke-RestMethod -Uri "$base/flashcards/cards/$secondCardId/review" -Method POST -Body $reviewBody2 -ContentType "application/json" -Headers $headers
    Write-Host "  PASS - EF: $($review2.newEaseFactor), Interval: $($review2.newInterval)d, Level: $($review2.masteryLevel)" -ForegroundColor Green
    $pass++
} catch {
    Write-Host "  FAIL - $($_.Exception.Message)" -ForegroundColor Red
    $fail++
}

# 12. Get progress
Write-Host "`n[12] GET /flashcards/progress - Trainee progress" -ForegroundColor Yellow
try {
    $prog = Invoke-RestMethod -Uri "$base/flashcards/progress" -Method GET -Headers $headers
    Write-Host "  PASS - Total: $($prog.totalCards), Studied: $($prog.studiedCards), Due: $($prog.dueToday)" -ForegroundColor Green
    $pass++
} catch {
    Write-Host "  FAIL - $($_.Exception.Message)" -ForegroundColor Red
    $fail++
}

# 13. AI Generate deck
Write-Host "`n[13] POST /flashcards/decks/generate - AI generate" -ForegroundColor Yellow
try {
    $genBody = '{"topic": "Property Valuation", "numberOfCards": 5}'
    $genDeck = Invoke-RestMethod -Uri "$base/flashcards/decks/generate" -Method POST -Body $genBody -ContentType "application/json" -Headers $headers
    Write-Host "  PASS - Generated: $($genDeck.title), Cards: $($genDeck.cardCount)" -ForegroundColor Green
    $pass++
} catch {
    Write-Host "  FAIL - $($_.Exception.Message)" -ForegroundColor Red
    $fail++
}

# 14. Delete card
Write-Host "`n[14] DELETE /flashcards/cards/$cardId - Delete card" -ForegroundColor Yellow
try {
    Invoke-RestMethod -Uri "$base/flashcards/cards/$cardId" -Method DELETE -Headers $headers
    Write-Host "  PASS - Card deleted" -ForegroundColor Green
    $pass++
} catch {
    Write-Host "  FAIL - $($_.Exception.Message)" -ForegroundColor Red
    $fail++
}

Write-Host "`n=== RESULTS: $pass PASSED, $fail FAILED ===" -ForegroundColor $(if ($fail -eq 0) { "Green" } else { "Red" })
