MEDIA VOOR DE QUIZ
==================
Zet hier je eigen bestanden (werkt ook zonder internet):

  blur/    foto's voor ronde 2 (bestandsnamen staan in questions.json, bv. blur/hunebed.jpg)
  logos/   logo's voor de logoronde (bv. logos/nike.png, liefst op witte of transparante achtergrond)
  audio/   geluidsfragmenten voor de muziekronde (.mp3/.m4a)

In questions.json verwijs je er zo naar, zonder "media/" ervoor:
  "media": { "kind": "image", "src": "blur/hunebed.jpg" }
Liedjes: voeg bij een liedje "audio": "audio/billie-jean.mp3" toe.
Ontbreekt een bestand, dan toont de tv een plaatsvervanger met de bestandsnaam.
Tip: plaatjes van ongeveer 1600 pixels breed laden snel.
