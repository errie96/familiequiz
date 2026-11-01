MEDIA VOOR DE QUIZ
==================

Zet hier je eigen plaatjes en geluidsfragmenten, dan werkt alles ook zonder internet
en verlopen er geen links.

  audio/    geluidsfragmenten (.mp3, .m4a)
  images/   plaatjes (.jpg, .png)

In questions.json verwijs je er zo naar (zonder "media/" ervoor):

  "media": { "kind": "image", "src": "images/hunebed.jpg" }
  "media": { "kind": "audio", "src": "audio/nummer1.mp3" }

Een volledige link (https://...) werkt ook, maar kan verlopen of wegvallen.
De oude velden "imageUrl" en "audioUrl" werken nog steeds.

Tips:
  - Maak plaatjes niet groter dan ongeveer 1600 pixels breed; dat laadt snel op de wifi.
  - Geluidsfragmenten worden alleen op het tv-scherm afgespeeld, niet op de telefoons.
