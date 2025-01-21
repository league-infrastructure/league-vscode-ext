#!/usr/bin/env python

# Test telemetry server

from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route('/', methods=['POST'])
def content_length():
	# Get the Content-Length from the request headers
	content_length = request.headers.get('Content-Length', 0)

	posted_data = request.get_json()
	print(posted_data)

	# Return the Content-Length as a JSON response
	return jsonify({"Content-Length": content_length})

if __name__ == "__main__":
	# Run the Flask web server on port 8095
	app.run(host="0.0.0.0", port=8095)