#!/bin/bash

# WordPress Image Download Script
echo "📥 Downloading WordPress images for migration..."

mkdir -p ./temp-images


echo "Downloading 1/5: DSC01057-web.jpg"
curl -L "http://www.velescoinc.com/wp-content/uploads/2019/05/DSC01057-web.jpg" -o "./temp-images/DSC01057-web.jpg" --user-agent "Mozilla/5.0 (compatible; Velesco-Bot/1.0)"

echo "Downloading 2/5: bruno-1-1.jpg"
curl -L "https://i2.wp.com/velescoinc.com/wp-content/uploads/2019/05/bruno-1-1.jpg?resize=469%2C264\&ssl=1" -o "./temp-images/bruno-1-1.jpg" --user-agent "Mozilla/5.0 (compatible; Velesco-Bot/1.0)"

echo "Downloading 3/5: DSC00857-web2.jpg"
curl -L "http://velescoinc.com/wp-content/uploads/2019/05/DSC00857-web2.jpg" -o "./temp-images/DSC00857-web2.jpg" --user-agent "Mozilla/5.0 (compatible; Velesco-Bot/1.0)"

echo "Downloading 4/5: macarons.jpg"
curl -L "https://www.velescoinc.com/wp-content/uploads/2019/02/macarons.jpg" -o "./temp-images/macarons.jpg" --user-agent "Mozilla/5.0 (compatible; Velesco-Bot/1.0)"

echo "Downloading 5/5: cheese-pancakes-1.jpg"
curl -L "https://www.velescoinc.com/wp-content/uploads/2018/11/cheese-pancakes-1.jpg" -o "./temp-images/cheese-pancakes-1.jpg" --user-agent "Mozilla/5.0 (compatible; Velesco-Bot/1.0)"


echo "✅ Download completed! Images are in ./temp-images/"
echo "📤 You can now upload these to R2 using:"
echo "  - The admin interface at /admin"
echo "  - Or manually via API"
