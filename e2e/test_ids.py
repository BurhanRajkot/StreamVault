import urllib.request
import json
import urllib.parse
import os

api_key = os.getenv("VITE_TMDB_API_KEY", "")

# Actually I don't need TMDB API key if I just check the web page directly
def check_tmdb_id(type, id):
    try:
        url = f"https://www.themoviedb.org/{type}/{id}"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        res = urllib.request.urlopen(req)
        return res.geturl()
    except Exception as e:
        return str(e)

print("108050:", check_tmdb_id('movie', 108050))
print("10312:", check_tmdb_id('movie', 10312))
print("467244:", check_tmdb_id('movie', 467244)) # Zone of Interest

