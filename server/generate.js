// Content generation service using Claude
import Anthropic from '@anthropic-ai/sdk';

const anthropic = process.env.ANTHROPIC_API_KEY 
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

// Content templates/prompts for each product type
const PROMPTS = {
  boost: (product) => `Create a Twitter/X post that promotes BOTH a relevant blog article AND a product together.

Blog Article:
- Title: ${product.blogTitle}
- URL: ${product.blogUrl}
- Key insight: ${product.blogSnippet}

Product:
- Name: ${product.name}
- Description: ${product.description}
- URL: ${product.productUrl || '[PRODUCT_LINK]'}

Write a single tweet (MUST be under 250 characters excluding URLs) that:
1. Highlights an interesting insight from the blog article
2. Naturally ties it to the product as a relevant solution/example
3. Includes both URLs (they'll be added separately, just write [BLOG_LINK] and [PRODUCT_LINK])
4. Feels like genuine curation, NOT an ad

The tone should be: "Found this great article, and if you're into this, check out..."

Return ONLY the tweet text with [BLOG_LINK] and [PRODUCT_LINK] placeholders. No hashtags needed.`,

  social: (product) => `Create an engaging social media post for this product:

Product Name: ${product.name}
Description: ${product.description}
Key Features: ${product.features || 'Not specified'}
Target Audience: ${product.audience || 'General'}

Write a single compelling post (under 280 characters for Twitter compatibility) with:
- An attention-grabbing hook
- Key benefit
- Call to action
- 3-5 relevant hashtags

Return ONLY the post text, nothing else.`,

  carousel: (product) => `Create a 5-slide Instagram carousel for this product:

Product Name: ${product.name}
Description: ${product.description}
Key Features: ${product.features || 'Not specified'}
Target Audience: ${product.audience || 'General'}

For each slide, provide:
- Slide headline (short, punchy)
- Body text (1-2 sentences)

Format as:
SLIDE 1: [Hook/Problem]
Headline: ...
Body: ...

SLIDE 2: [Introduce Solution]
...

SLIDE 3: [Key Benefit 1]
...

SLIDE 4: [Key Benefit 2 / Social Proof]
...

SLIDE 5: [CTA]
...

Also include a caption with hashtags at the end.`,

  video: (product) => `Create a TikTok/Reels video script for this product:

Product Name: ${product.name}
Description: ${product.description}
Key Features: ${product.features || 'Not specified'}
Target Audience: ${product.audience || 'General'}

Create a 30-60 second script with:
- HOOK (first 3 seconds - must stop the scroll)
- PROBLEM (what pain point does this solve?)
- SOLUTION (introduce the product)
- BENEFITS (2-3 quick hits)
- CTA (what should they do?)

Include suggested:
- On-screen text for each section
- Trending sound suggestions
- Visual direction notes

Format clearly with timestamps.`,

  blog: (product) => `Write a 500-word SEO blog snippet for this product:

Product Name: ${product.name}
Description: ${product.description}
Key Features: ${product.features || 'Not specified'}
Target Audience: ${product.audience || 'General'}
Keywords: ${product.keywords || product.name}

Include:
- Compelling H1 title (SEO optimized)
- Meta description (155 characters)
- Introduction paragraph with hook
- 2-3 subheadings (H2) with content
- Bullet points for features/benefits
- Conclusion with CTA

Write in a conversational, engaging tone.`,

  email: (product) => `Create an email marketing blast for this product:

Product Name: ${product.name}
Description: ${product.description}
Key Features: ${product.features || 'Not specified'}
Target Audience: ${product.audience || 'General'}
Offer/Promotion: ${product.offer || 'Check it out'}

Create:
- 3 subject line options (A/B test ready)
- Preview text
- Email body with:
  - Personal greeting
  - Hook/opening line
  - Product introduction
  - 3 key benefits (bullet points)
  - Social proof placeholder
  - Clear CTA button text
  - P.S. line

Keep it scannable and under 200 words for the body.`,
};

// Mock content for testing without API key
const MOCK_CONTENT = {
  boost: (product) => `Great read on ${product.blogTitle?.slice(0, 50) || 'this topic'}. Key takeaway: quality matters more than quantity.

If you're exploring this space, ${product.name || 'this product'} is worth checking out.

[BLOG_LINK]
[PRODUCT_LINK]`,

  social: (product) => `🔥 Stop scrolling! ${product.name} is here to change your game.

${product.description?.slice(0, 100) || 'This is exactly what you\'ve been looking for.'}

👉 Link in bio to grab yours!

#${product.name?.replace(/\s+/g, '')} #NewProduct #MustHave #ShopNow #Trending`,

  carousel: (product) => `SLIDE 1: [Hook]
Headline: Tired of ${product.name ? 'not having ' + product.name : 'the same old routine'}?
Body: We've got something that'll change everything.

SLIDE 2: [Solution]
Headline: Introducing ${product.name || 'Your New Favorite'}
Body: ${product.description?.slice(0, 100) || 'The solution you\'ve been waiting for.'}

SLIDE 3: [Benefit 1]
Headline: Save Time & Money
Body: Why settle for less when you can have the best?

SLIDE 4: [Social Proof]
Headline: Join 1000+ Happy Customers
Body: "This changed my life!" - Actual Customer

SLIDE 5: [CTA]
Headline: Ready to Transform?
Body: Tap the link in bio to get started today!

Caption: ${product.name || 'New product'} is HERE! 🚀 Don't miss out on this game-changer. Link in bio! #NewLaunch #MustHave #ShopNow`,

  video: (product) => `🎬 VIDEO SCRIPT: ${product.name || 'Product'} (30-45 sec)

[0:00-0:03] HOOK
🎤 "Wait, you're still not using ${product.name || 'this'}?!"
📱 On-screen: "POV: You discover ${product.name || 'this'}"

[0:03-0:08] PROBLEM
🎤 "I used to struggle with [problem] every single day..."
📱 On-screen: Show frustration/pain point

[0:08-0:18] SOLUTION
🎤 "Then I found ${product.name || 'this'}. ${product.description?.slice(0, 50) || 'Game changer.'}"
📱 On-screen: Product reveal moment

[0:18-0:25] BENEFITS
🎤 Quick hits:
- "It's so easy"
- "Actually works"
- "Worth every penny"
📱 On-screen: Show each benefit

[0:25-0:30] CTA
🎤 "Link in bio - trust me on this one!"
📱 On-screen: "Link in bio 👇"

🎵 Suggested sounds: Trending audio / upbeat lo-fi
📍 Post during: 6-9 PM for max reach`,

  blog: (product) => `# ${product.name || 'Product'}: The Complete Guide

**Meta Description:** Discover why ${product.name || 'this product'} is taking the market by storm. Learn about features, benefits, and why customers love it.

## Introduction

In a world full of options, finding the right ${product.name?.toLowerCase() || 'solution'} can feel overwhelming. That's exactly why we created something different.

${product.description || 'Our product is designed with you in mind, focusing on quality, ease of use, and real results.'}

## Why ${product.name || 'This Product'} Stands Out

What makes this different from everything else on the market?

- **Quality First**: Built to last, designed to impress
- **User-Friendly**: No learning curve, just results
- **Proven Results**: Join thousands of satisfied customers

## Key Features

${product.features || '- Premium materials\n- Easy setup\n- Outstanding support'}

## Ready to Get Started?

Don't wait to experience the difference. **[Shop Now]** and see why everyone's talking about ${product.name || 'this product'}.`,

  email: (product) => `📧 EMAIL CAMPAIGN: ${product.name || 'Product Launch'}

**Subject Line Options:**
A: "You're going to want to see this..."
B: "${product.name || 'This'} just dropped 🔥"
C: "We made something special for you"

**Preview Text:** The wait is over. Here's what everyone's talking about.

---

Hey there,

We've been keeping a secret... and we're finally ready to share it with you.

Introducing **${product.name || 'our newest product'}**.

${product.description || 'This is the solution you\'ve been waiting for.'}

**Here's why you'll love it:**

✅ Saves you time
✅ Easy to use
✅ Actually delivers results

**[SHOP NOW]**

Talk soon,
The Team

P.S. ${product.offer || 'This intro price won\'t last forever. Just saying.'} 👀`,
};

export async function generateContent(productType, productData) {
  const product = typeof productData === 'string' ? JSON.parse(productData) : productData;
  
  // If no product data, use defaults
  const productInfo = {
    name: product.name || 'Amazing Product',
    description: product.description || 'A fantastic product that solves your problems.',
    features: product.features || '',
    audience: product.audience || '',
    keywords: product.keywords || '',
    offer: product.offer || '',
    // Boost fields
    blogTitle: product.blogTitle || '',
    blogUrl: product.blogUrl || '',
    blogSnippet: product.blogSnippet || '',
    productUrl: product.productUrl || '',
  };

  // If no Anthropic key, use mock content
  if (!anthropic) {
    console.log('⚠️  No ANTHROPIC_API_KEY - using mock content');
    const mockFn = MOCK_CONTENT[productType];
    if (!mockFn) {
      throw new Error(`Unknown product type: ${productType}`);
    }
    return {
      content: mockFn(productInfo),
      mock: true,
    };
  }

  // Generate with Claude
  const promptFn = PROMPTS[productType];
  if (!promptFn) {
    throw new Error(`Unknown product type: ${productType}`);
  }

  try {
    console.log(`🤖 Calling Claude for ${productType} generation...`);
    
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: promptFn(productInfo),
        },
      ],
      system: 'You are an expert marketing copywriter who creates engaging, conversion-focused content. Be creative, punchy, and authentic. Avoid clichés. Return only the requested content, no preamble or explanations.',
    });

    const content = response.content[0].type === 'text' 
      ? response.content[0].text 
      : '';

    return {
      content,
      mock: false,
      usage: response.usage,
    };
  } catch (error) {
    console.error('Claude API error:', error);
    // Fallback to mock on error
    return {
      content: MOCK_CONTENT[productType](productInfo),
      mock: true,
      error: error.message,
    };
  }
}
